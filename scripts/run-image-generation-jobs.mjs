import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();

const loadDotEnvLocal = async () => {
  const envPath = path.join(root, '.env.local');
  try {
    const raw = await fs.readFile(envPath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) continue;
      const [, key, value] = match;
      if (process.env[key] !== undefined) continue;
      process.env[key] = value.replace(/^("|')(.*)\1$/, '$2');
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
};

await loadDotEnvLocal();
const jobsPath = path.join(root, 'data', 'generated', 'canonical-image-generation-jobs.json');
const reportPath = path.join(root, 'data', 'generated', 'canonical-image-generation-results.json');
const apiKey = process.env.OPENAI_API_KEY;
const dryRun = process.argv.includes('--dry-run') || !apiKey;
const selectedStateArg = process.argv.find((arg) => arg.startsWith('--state='));
const selectedState = selectedStateArg ? selectedStateArg.split('=')[1] : null;

const readJson = async (targetPath) => JSON.parse(await fs.readFile(targetPath, 'utf8'));

const ensureDir = async (targetPath) => {
  await fs.mkdir(targetPath, { recursive: true });
};

const resolveFromRoot = (relativePath) => path.join(root, relativePath.replace(/^[/\\]+/, '').replace(/\//g, path.sep));

const decodeBase64Image = (value) => Buffer.from(value, 'base64');

const fetchImageBuffer = async (url) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download generated image: ${response.status} ${response.statusText}`);
  }

  return Buffer.from(await response.arrayBuffer());
};

const buildMultipart = async (job) => {
  const form = new FormData();
  const imagePath = resolveFromRoot(job.image);
  const imageBuffer = await fs.readFile(imagePath);

  form.set('model', job.model.replace(/^openai\//, ''));
  form.set('prompt', job.prompt);
  form.set('size', job.size);
  form.set('n', String(job.count));
  form.set('image', new Blob([imageBuffer], { type: 'image/png' }), path.basename(imagePath));

  return form;
};

const jobs = (await readJson(jobsPath)).filter((job) => !selectedState || job.stateId === selectedState);

if (!jobs.length) {
  console.log(selectedState ? `No image generation jobs found for ${selectedState}.` : 'No image generation jobs found.');
  process.exit(0);
}

const results = [];
const runStartedAt = new Date().toISOString();

for (const job of jobs) {
  const outputDir = resolveFromRoot(job.outputDir);
  await ensureDir(outputDir);

  const baseResult = {
    stateId: job.stateId,
    stateIndex: job.stateIndex,
    label: job.label,
    provider: job.provider ?? 'openai-images-edits',
    mode: job.mode ?? 'edit',
    model: job.model,
    image: job.image,
    outputDir: job.outputDir,
    canonicalTarget: job.canonicalTarget,
    suggestedOutputs: job.suggestedOutputs,
    renderManifestPath: job.renderManifestPath ?? null,
    renderPromptPath: job.renderPromptPath ?? null,
    recordedAt: runStartedAt,
  };

  if (dryRun) {
    results.push({
      ...baseResult,
      status: apiKey ? 'dry-run' : 'blocked-missing-openai-api-key',
      notes: apiKey
        ? 'Dry run only. No provider request was sent.'
        : 'OPENAI_API_KEY is not configured, so the provider request was not sent.'
    });
    continue;
  }

  try {
    const form = await buildMultipart(job);
    const response = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      body: form
    });

    if (!response.ok) {
      const errorText = await response.text();
      results.push({
        ...baseResult,
        status: 'failed',
        notes: `OpenAI image edit failed for ${job.stateId}: ${response.status} ${response.statusText} - ${errorText}`
      });
      continue;
    }

    const payload = await response.json();
    const outputs = [];

    for (const [index, item] of (payload.data ?? []).entries()) {
      const suggestedName = job.suggestedOutputs[index] ?? `${job.stateId}-adjacent-${String(index + 1).padStart(2, '0')}.png`;
      const outputPath = path.join(outputDir, suggestedName);
      const imageBuffer = item.b64_json
        ? decodeBase64Image(item.b64_json)
        : item.url
          ? await fetchImageBuffer(item.url)
          : null;

      if (!imageBuffer) {
        throw new Error(`OpenAI image edit returned no image payload for ${job.stateId} result ${index + 1}.`);
      }

      await fs.writeFile(outputPath, imageBuffer);
      outputs.push(path.relative(root, outputPath).replace(/\\/g, '/'));
    }

    results.push({
      ...baseResult,
      status: 'generated',
      outputs,
      notes: `Generated ${outputs.length} still candidate(s).`
    });
  } catch (error) {
    results.push({
      ...baseResult,
      status: 'failed',
      notes: error instanceof Error ? error.message : String(error)
    });
  }
}

await fs.writeFile(reportPath, `${JSON.stringify(results, null, 2)}\n`);

console.log(`Processed ${results.length} image generation job(s). Results written to ${path.relative(root, reportPath).replace(/\\/g, '/')}.`);
if (dryRun && !apiKey) {
  console.log('Provider execution was skipped because OPENAI_API_KEY is not configured.');
}

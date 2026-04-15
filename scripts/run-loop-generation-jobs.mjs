import fs from 'node:fs/promises';
import path from 'node:path';
import { fal } from '@fal-ai/client';

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
      process.env[key] = value.replace(/^(["'])(.*)\1$/, '$2');
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
};

await loadDotEnvLocal();
const jobsPath = path.join(root, 'data', 'generated', 'canonical-loop-render-jobs.json');
const reportPath = path.join(root, 'data', 'generated', 'canonical-loop-generation-results.json');
const falKey = process.env.FAL_KEY;
const runwayApiKey = process.env.RUNWAY_API_KEY?.trim();
const configuredModel = process.env.FAL_VIDEO_MODEL?.trim();
const defaultModel = configuredModel || 'fal-ai/minimax/video-01/image-to-video';
const selectedStateArg = process.argv.find((arg) => arg.startsWith('--state='));
const selectedVariantArg = process.argv.find((arg) => arg.startsWith('--variant='));
const selectedModelArg = process.argv.find((arg) => arg.startsWith('--model='));
const timeoutMsArg = process.argv.find((arg) => arg.startsWith('--timeout-ms='));
const selectedState = selectedStateArg ? selectedStateArg.split('=')[1] : null;
const selectedVariant = selectedVariantArg ? selectedVariantArg.split('=')[1].toLowerCase() : null;
const selectedModel = selectedModelArg ? selectedModelArg.split('=')[1] : defaultModel;
const providerTimeoutMs = Number.parseInt(timeoutMsArg ? timeoutMsArg.split('=')[1] : process.env.FAL_VIDEO_TIMEOUT_MS || '300000', 10);
const disablePromptOptimizer = /minimax/i.test(selectedModel);
const isRunwaySelected = /^runway:/i.test(selectedModel);
const dryRun = process.argv.includes('--dry-run') || (!isRunwaySelected && !falKey) || (isRunwaySelected && !runwayApiKey);

const readJson = async (targetPath) => JSON.parse(await fs.readFile(targetPath, 'utf8'));
const ensureDir = async (targetPath) => {
  await fs.mkdir(targetPath, { recursive: true });
};
const resolveFromRoot = (relativePath) => path.join(root, relativePath.replace(/^[/\\]+/, '').replace(/\//g, path.sep));
const relativeFromRoot = (targetPath) => path.relative(root, targetPath).replace(/\\/g, '/');
const exitCleanly = async (code = 0) => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  process.exit(code);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const buildDataUri = async (imagePath) => {
  const imageBuffer = await fs.readFile(imagePath);
  const ext = path.extname(imagePath).toLowerCase();
  const mimeType = ext === '.webp'
    ? 'image/webp'
    : ext === '.jpg' || ext === '.jpeg'
      ? 'image/jpeg'
      : 'image/png';

  return `data:${mimeType};base64,${imageBuffer.toString('base64')}`;
};

const withTimeout = async (promiseFactory, timeoutMs, label) => {
  let timeoutId;

  try {
    return await Promise.race([
      promiseFactory(),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

const fetchVideoBuffer = async (url) => {
  const response = await withTimeout(
    () => fetch(url),
    providerTimeoutMs,
    `Video download for ${url}`
  );
  if (!response.ok) {
    throw new Error(`Failed to download generated video: ${response.status} ${response.statusText}`);
  }

  return Buffer.from(await withTimeout(
    () => response.arrayBuffer(),
    providerTimeoutMs,
    `Video body read for ${url}`
  ));
};

const runwayHeaders = () => ({
  Authorization: `Bearer ${runwayApiKey}`,
  'X-Runway-Version': '2024-11-06',
  'Content-Type': 'application/json'
});

const createRunwayImageToVideo = async ({ imageDataUri, promptText, durationSeconds = 5 }) => {
  const response = await withTimeout(
    () => fetch('https://api.dev.runwayml.com/v1/image_to_video', {
      method: 'POST',
      headers: runwayHeaders(),
      body: JSON.stringify({
        model: selectedModel.replace(/^runway:/i, ''),
        promptImage: imageDataUri,
        promptText,
        ratio: '1280:720',
        duration: durationSeconds,
      })
    }),
    providerTimeoutMs,
    'Runway create image_to_video task'
  );

  if (!response.ok) {
    throw new Error(`Runway create failed: ${response.status} ${response.statusText} ${await response.text()}`);
  }

  return response.json();
};

const getRunwayTask = async (taskId) => {
  const response = await withTimeout(
    () => fetch(`https://api.dev.runwayml.com/v1/tasks/${taskId}`, {
      method: 'GET',
      headers: runwayHeaders(),
    }),
    providerTimeoutMs,
    `Runway get task ${taskId}`
  );

  if (!response.ok) {
    throw new Error(`Runway task fetch failed: ${response.status} ${response.statusText} ${await response.text()}`);
  }

  return response.json();
};

const waitForRunwayVideoUrl = async (taskId) => {
  const started = Date.now();
  while (Date.now() - started < providerTimeoutMs) {
    const task = await getRunwayTask(taskId);
    const status = String(task?.status || task?.state || '').toLowerCase();
    const output = task?.output || task?.result || task?.data || {};
    const videoUrl = Array.isArray(output)
      ? output.find((value) => typeof value === 'string' && /^https?:/i.test(value))
      : output?.videoUrl || output?.url || output?.video?.url || task?.videoUrl;

    if (status === 'succeeded' || status === 'success' || status === 'completed') {
      if (!videoUrl) throw new Error(`Runway task ${taskId} succeeded without a video URL`);
      return { task, videoUrl };
    }

    if (status === 'failed' || status === 'error' || status === 'cancelled') {
      throw new Error(`Runway task ${taskId} failed: ${JSON.stringify(task)}`);
    }

    await sleep(5000);
  }

  throw new Error(`Runway task ${taskId} timed out after ${providerTimeoutMs}ms`);
};

const compactRunwayPrompt = (job) => {
  const variantB = job.variant === 'b';
  const base = [
    `${job.label} Bull Bear from the reference still.`,
    'Use the exact same creature identity, anatomy, framing, camera, and environment.',
    'Premium cinematic seamless loop with the first frame treated as the final frame target.',
    'Return to the exact opening composition at the end.',
    'No pose drift, no camera drift, no perspective change, no head turn, no leg movement, no mouth change, no torso-height change, and no background alignment shift.',
    'No paper scraps, bills, flyers, confetti, tickets, posters, or rectangular debris.'
  ];

  if (variantB) {
    base.push(
      'Variant B must be almost still and seam-first.',
      'Hold the hero pose nearly frozen for the full shot.',
      'Allow only tiny cyclic breathing, ember shimmer, faint haze drift, and a minimal light pulse that cleanly resolves back to frame one.',
      'Do not step, lunge, sway, crouch, lean, nod, look around, or move the forelegs.',
      'If liveliness conflicts with loop continuity, choose continuity.'
    );
  } else {
    base.push('Allow only subtle cyclic breathing, ember shimmer, and haze pulse.');
  }

  const text = base.join(' ');
  return text.length <= 1000 ? text : text.slice(0, 1000);
};

const runwayDurationSecondsForJob = (job) => (job.variant === 'b' ? 4 : 5);

const jobs = (await readJson(jobsPath)).filter((job) => {
  if (selectedState && job.stateId !== selectedState) return false;
  if (selectedVariant && job.variant !== selectedVariant) return false;
  return true;
});

if (!jobs.length) {
  const selector = [selectedState, selectedVariant].filter(Boolean).join(' / ');
  console.log(selector ? `No loop generation jobs found for ${selector}.` : 'No loop generation jobs found.');
  await exitCleanly(0);
}

if (falKey) {
  fal.config({ credentials: falKey });
}

const results = [];
const runStartedAt = new Date().toISOString();

for (const job of jobs) {
  const renderDir = resolveFromRoot(job.renderDir);
  const outputPath = resolveFromRoot(job.loopTargetFilesystemPath);
  const stillReferencePath = resolveFromRoot(job.stillReferenceCopy || job.stillSource);
  await ensureDir(renderDir);
  await ensureDir(path.dirname(outputPath));

  console.log(`Starting loop job ${job.stateId}/${job.variant} with model ${selectedModel}.`);

  if (dryRun) {
    results.push({
      stateId: job.stateId,
      stateIndex: job.stateIndex,
      label: job.label,
      variant: job.variant,
      status: isRunwaySelected
        ? (runwayApiKey ? 'dry-run' : 'blocked-missing-runway-api-key')
        : (falKey ? 'dry-run' : 'blocked-missing-fal-key'),
      provider: isRunwaySelected ? 'runway' : 'fal.ai',
      model: selectedModel,
      stillReference: job.stillReferenceCopy,
      stillSource: job.stillSource,
      renderDir: job.renderDir,
      target: job.loopTarget,
      targetFilesystemPath: job.loopTargetFilesystemPath,
      recordedAt: runStartedAt,
      notes: isRunwaySelected
        ? (runwayApiKey ? 'Dry run only. No Runway request was sent.' : 'RUNWAY_API_KEY is not configured, so the Runway request was not sent.')
        : (falKey ? 'Dry run only. No animation provider request was sent.' : 'FAL_KEY is not configured, so the animation provider request was not sent.')
    });
    continue;
  }

  try {
    const imageUrl = await buildDataUri(stillReferencePath);
    let videoUrl;
    let requestId = null;

    if (isRunwaySelected) {
      const createResult = await createRunwayImageToVideo({
        imageDataUri: imageUrl,
        promptText: compactRunwayPrompt(job),
        durationSeconds: runwayDurationSecondsForJob(job),
      });
      const taskId = createResult?.id || createResult?.taskId;
      if (!taskId) {
        throw new Error(`Runway create response missing task id: ${JSON.stringify(createResult)}`);
      }
      requestId = taskId;
      const waited = await waitForRunwayVideoUrl(taskId);
      videoUrl = waited.videoUrl;
    } else {
      const result = await withTimeout(
        () => fal.subscribe(selectedModel, {
          input: {
            image_url: imageUrl,
            prompt: job.renderPrompt || job.prompt,
            ...(disablePromptOptimizer ? {} : { prompt_optimizer: true })
          },
          logs: true
        }),
        providerTimeoutMs,
        `fal subscribe for ${job.stateId}/${job.variant}`
      );

      videoUrl = result?.data?.video?.url;
      requestId = result?.requestId ?? null;
      if (!videoUrl) {
        throw new Error(`fal result for ${job.stateId}/${job.variant} did not include video.url`);
      }
    }

    const videoBuffer = await fetchVideoBuffer(videoUrl);
    await fs.writeFile(outputPath, videoBuffer);

    results.push({
      stateId: job.stateId,
      stateIndex: job.stateIndex,
      label: job.label,
      variant: job.variant,
      status: 'generated',
      provider: isRunwaySelected ? 'runway' : 'fal.ai',
      model: selectedModel,
      stillReference: job.stillReferenceCopy,
      stillSource: job.stillSource,
      renderDir: job.renderDir,
      target: job.loopTarget,
      targetFilesystemPath: job.loopTargetFilesystemPath,
      output: relativeFromRoot(outputPath),
      providerResultUrl: videoUrl,
      requestId,
      recordedAt: runStartedAt,
      notes: 'Generated loop and saved it to the canonical runtime target.'
    });

    console.log(`Completed loop job ${job.stateId}/${job.variant} -> ${relativeFromRoot(outputPath)}.`);
  } catch (error) {
    results.push({
      stateId: job.stateId,
      stateIndex: job.stateIndex,
      label: job.label,
      variant: job.variant,
      status: 'failed',
      provider: isRunwaySelected ? 'runway' : 'fal.ai',
      model: selectedModel,
      stillReference: job.stillReferenceCopy,
      stillSource: job.stillSource,
      renderDir: job.renderDir,
      target: job.loopTarget,
      targetFilesystemPath: job.loopTargetFilesystemPath,
      recordedAt: runStartedAt,
      notes: error instanceof Error ? error.message : String(error)
    });
  }

  await fs.writeFile(reportPath, `${JSON.stringify(results, null, 2)}\n`);
}

await fs.writeFile(reportPath, `${JSON.stringify(results, null, 2)}\n`);

console.log(`Processed ${results.length} loop generation job(s) with model ${selectedModel}. Results written to ${relativeFromRoot(reportPath)}.`);
if (dryRun) {
  if (isRunwaySelected && !runwayApiKey) {
    console.log('Provider execution was skipped because RUNWAY_API_KEY is not configured.');
  } else if (!isRunwaySelected && !falKey) {
    console.log('Provider execution was skipped because FAL_KEY is not configured.');
  }
}

await exitCleanly(0);

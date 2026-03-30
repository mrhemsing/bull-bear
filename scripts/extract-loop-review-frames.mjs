import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = process.cwd();
const jobsPath = path.join(root, 'data', 'generated', 'canonical-loop-render-jobs.json');
const generationResultsPath = path.join(root, 'data', 'generated', 'canonical-loop-generation-results.json');
const outputDir = path.join(root, 'out', 'loop-review-frames');
const reportJsonPath = path.join(root, 'data', 'generated', 'loop-review-frames.json');
const reportMdPath = path.join(root, 'data', 'generated', 'loop-review-frames.md');
const reportHtmlPath = path.join(root, 'data', 'generated', 'loop-review-frames.html');

const selectedStateArg = process.argv.find((arg) => arg.startsWith('--state='));
const selectedStatesArg = process.argv.find((arg) => arg.startsWith('--states='));
const selectedVariantArg = process.argv.find((arg) => arg.startsWith('--variant='));
const timeArg = process.argv.find((arg) => arg.startsWith('--time='));
const overwrite = process.argv.includes('--overwrite');

const selectedState = selectedStateArg ? selectedStateArg.split('=')[1].trim() : null;
const selectedStates = new Set(
  selectedStatesArg
    ? selectedStatesArg.split('=')[1].split(',').map((value) => value.trim()).filter(Boolean)
    : selectedState
      ? [selectedState]
      : []
);
const selectedVariant = selectedVariantArg ? selectedVariantArg.split('=')[1].trim().toLowerCase() : 'b';
const timestampSeconds = timeArg ? timeArg.split('=')[1].trim() : '0';

const readJson = async (targetPath) => JSON.parse(await fs.readFile(targetPath, 'utf8'));
const ensureDir = async (targetPath) => fs.mkdir(targetPath, { recursive: true });
const relativeFromRoot = (targetPath) => path.relative(root, targetPath).replace(/\\/g, '/');
const resolveFromRoot = (relativePath) => path.join(root, relativePath.replace(/^[/\\]+/, '').replace(/\//g, path.sep));
const escapeHtml = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');
const exists = async (targetPath) => {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
};

const runFfmpeg = (inputPath, outputPath) => new Promise((resolve, reject) => {
  const args = [
    '-y',
    '-ss', timestampSeconds,
    '-i', inputPath,
    '-frames:v', '1',
    outputPath
  ];

  const child = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';

  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  child.on('error', (error) => {
    reject(error);
  });

  child.on('close', (code) => {
    if (code === 0) {
      resolve();
      return;
    }

    reject(new Error(stderr.trim() || `ffmpeg exited with code ${code}`));
  });
});

const jobs = (await readJson(jobsPath)).filter((job) => {
  if (selectedStates.size && !selectedStates.has(job.stateId)) return false;
  if (selectedVariant && job.variant !== selectedVariant) return false;
  return true;
});

if (!jobs.length) {
  console.log('No matching loop review-frame jobs found.');
  process.exit(0);
}

let generationResults = [];
try {
  generationResults = await readJson(generationResultsPath);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

const generationResultByKey = new Map(
  Array.isArray(generationResults)
    ? generationResults.map((item) => [`${item.stateId}:${item.variant ?? ''}`, item])
    : []
);

await ensureDir(outputDir);

const extractedAt = new Date().toISOString();
const results = [];

for (const job of jobs) {
  const key = `${job.stateId}:${job.variant ?? ''}`;
  const generation = generationResultByKey.get(key) ?? null;
  const inputPath = resolveFromRoot(job.loopTargetFilesystemPath);
  const stateOutputDir = path.join(outputDir, `${job.stateId}-${job.variant}`);
  const outputPath = path.join(stateOutputDir, `${job.stateId}-${job.variant}-frame-${timestampSeconds.replace(/[^0-9a-zA-Z_-]/g, '-') || '0'}.png`);
  await ensureDir(stateOutputDir);

  if (!(await exists(inputPath))) {
    results.push({
      stateId: job.stateId,
      stateIndex: job.stateIndex,
      label: job.label,
      variant: job.variant,
      source: job.loopTargetFilesystemPath,
      reviewFrame: relativeFromRoot(outputPath),
      extractedAt,
      generationStatus: generation?.status ?? 'not-recorded',
      generationNotes: generation?.notes ?? null,
      status: 'missing-loop-file',
      notes: 'Canonical loop MP4 is not present on this host yet, so no review frame could be extracted.'
    });
    continue;
  }

  const generationFailed = generation && generation.status !== 'generated';
  const staleStatus = generationFailed ? 'stale-source-loop' : null;
  const staleNotes = generationFailed
    ? `Generation result is ${generation.status}${generation.notes ? ` (${generation.notes})` : ''}, so this extracted frame may still reflect the pre-rerender loop on disk.`
    : null;

  if (!overwrite && (await exists(outputPath))) {
    results.push({
      stateId: job.stateId,
      stateIndex: job.stateIndex,
      label: job.label,
      variant: job.variant,
      source: job.loopTargetFilesystemPath,
      reviewFrame: relativeFromRoot(outputPath),
      extractedAt,
      generationStatus: generation?.status ?? 'not-recorded',
      generationNotes: generation?.notes ?? null,
      status: staleStatus ?? 'already-exists',
      notes: staleNotes ?? 'Review frame already existed; rerun with --overwrite to replace it.'
    });
    continue;
  }

  try {
    await runFfmpeg(inputPath, outputPath);
    results.push({
      stateId: job.stateId,
      stateIndex: job.stateIndex,
      label: job.label,
      variant: job.variant,
      source: job.loopTargetFilesystemPath,
      reviewFrame: relativeFromRoot(outputPath),
      extractedAt,
      generationStatus: generation?.status ?? 'not-recorded',
      generationNotes: generation?.notes ?? null,
      status: staleStatus ?? 'extracted',
      notes: staleNotes ?? `Representative frame extracted at ${timestampSeconds}s for visual loop review.`
    });
  } catch (error) {
    results.push({
      stateId: job.stateId,
      stateIndex: job.stateIndex,
      label: job.label,
      variant: job.variant,
      source: job.loopTargetFilesystemPath,
      reviewFrame: relativeFromRoot(outputPath),
      extractedAt,
      generationStatus: generation?.status ?? 'not-recorded',
      generationNotes: generation?.notes ?? null,
      status: 'failed',
      notes: error instanceof Error ? error.message : String(error)
    });
  }
}

await fs.writeFile(reportJsonPath, `${JSON.stringify(results, null, 2)}\n`);

const mdLines = [
  '# Loop review frames',
  '',
  `Generated by \`npm run review:loops -- --variant=${selectedVariant}${selectedStates.size ? ` --states=${Array.from(selectedStates).join(',')}` : ''}\`.`,
  '',
  `Extracted at: ${extractedAt}`,
  `Variant filter: ${selectedVariant || 'all'}`,
  `State filter: ${selectedStates.size ? Array.from(selectedStates).join(', ') : 'all queued states'}`,
  `Timestamp seconds: ${timestampSeconds}`,
  '',
  '| State | Label | Variant | Review status | Generation | Loop MP4 | Review frame | Notes |',
  '| --- | --- | --- | --- | --- | --- | --- | --- |',
  ...results.map((item) => `| ${item.stateId.replace('state-', '')} | ${item.label} | ${item.variant.toUpperCase()} | ${item.status} | ${item.generationStatus ?? 'not-recorded'} | ${item.source} | ${item.reviewFrame} | ${item.notes.replace(/\|/g, '\\|')} |`)
];

await fs.writeFile(reportMdPath, `${mdLines.join('\n')}\n`);

const htmlLines = [
  '<!doctype html>',
  '<html lang="en">',
  '<head>',
  '  <meta charset="utf-8" />',
  '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
  '  <title>Loop review frames</title>',
  '  <style>',
  '    :root { color-scheme: dark; }',
  '    body { font-family: Inter, Segoe UI, Arial, sans-serif; margin: 24px; background: #0b1020; color: #e8ecf3; }',
  '    h1, h2, p { margin: 0 0 12px; }',
  '    .meta { color: #aab6cc; margin-bottom: 24px; }',
  '    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 20px; }',
  '    .card { background: #121a2b; border: 1px solid #25324a; border-radius: 14px; padding: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.25); }',
  '    .card h2 { font-size: 18px; }',
  '    .status { display: inline-block; margin: 8px 0 12px; padding: 4px 10px; border-radius: 999px; background: #1d2940; color: #b7c6df; font-size: 12px; }',
  '    .status.stale { background: #4a2d1d; color: #ffd1a8; }',
  '    .status.failed { background: #4a1d27; color: #ffb7c3; }',
  '    img { display: block; width: 100%; height: auto; border-radius: 10px; border: 1px solid #2d3b57; background: #05070d; margin-bottom: 12px; }',
  '    .warning { margin: 0 0 12px; padding: 10px 12px; border-radius: 10px; background: #3a2618; color: #ffd8b4; border: 1px solid #7a4a2a; }',
  '    ul { margin: 0; padding-left: 18px; color: #cdd7e8; }',
  '    code { color: #8ee6ff; }',
  '  </style>',
  '</head>',
  '<body>',
  '  <h1>Loop review frames</h1>',
  `  <p class="meta">Generated by <code>npm run review:loops -- --variant=${escapeHtml(selectedVariant)}${selectedStates.size ? ` --states=${escapeHtml(Array.from(selectedStates).join(','))}` : ''}</code> · Extracted at ${escapeHtml(extractedAt)} · Timestamp ${escapeHtml(timestampSeconds)}s</p>`,
  '  <div class="grid">',
  ...results.map((item) => {
    const reviewFrameAbsolute = resolveFromRoot(item.reviewFrame);
    const reviewFrameRelativeToHtml = path.relative(path.dirname(reportHtmlPath), reviewFrameAbsolute).replace(/\\/g, '/');
    const statusClass = item.status === 'stale-source-loop' ? 'status stale' : item.status === 'failed' ? 'status failed' : 'status';
    const isImageSafe = item.status === 'extracted' || item.status === 'already-exists' || item.status === 'stale-source-loop';
    return [
      '    <section class="card">',
      `      <h2>${escapeHtml(item.stateId)} · ${escapeHtml(item.label)} · ${escapeHtml(item.variant.toUpperCase())}</h2>`,
      `      <div class="${statusClass}">${escapeHtml(item.status)}</div>`,
      item.status === 'stale-source-loop'
        ? `      <p class="warning">${escapeHtml(item.notes)}</p>`
        : '',
      isImageSafe
        ? `      <img src="${escapeHtml(reviewFrameRelativeToHtml)}" alt="${escapeHtml(`${item.stateId} ${item.label} ${item.variant} review frame`)}" />`
        : '      <p>No review image available.</p>',
      '      <ul>',
      `        <li><strong>Generation:</strong> <code>${escapeHtml(item.generationStatus ?? 'not-recorded')}</code></li>`,
      `        <li><strong>Loop MP4:</strong> <code>${escapeHtml(item.source)}</code></li>`,
      `        <li><strong>Review frame:</strong> <code>${escapeHtml(item.reviewFrame)}</code></li>`,
      `        <li><strong>Notes:</strong> ${escapeHtml(item.notes)}</li>`,
      '      </ul>',
      '    </section>'
    ].filter(Boolean).join('\n');
  }),
  '  </div>',
  '</body>',
  '</html>'
];

await fs.writeFile(reportHtmlPath, `${htmlLines.join('\n')}\n`);

const extractedCount = results.filter((item) => item.status === 'extracted').length;
const staleCount = results.filter((item) => item.status === 'stale-source-loop').length;
const missingCount = results.filter((item) => item.status === 'missing-loop-file').length;
const failedCount = results.filter((item) => item.status === 'failed').length;

console.log(`Processed ${results.length} loop review-frame job(s): ${extractedCount} extracted, ${staleCount} stale-source-loop, ${missingCount} missing-loop-file, ${failedCount} failed.`);
console.log(`Wrote ${relativeFromRoot(reportJsonPath)}, ${relativeFromRoot(reportMdPath)}, and ${relativeFromRoot(reportHtmlPath)}.`);

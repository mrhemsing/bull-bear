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
const endOffsetSeconds = '0.1';

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

const runFfmpeg = (args) => new Promise((resolve, reject) => {
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

const runFfmpegCapture = (args) => new Promise((resolve, reject) => {
  const child = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });

  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  child.on('error', (error) => {
    reject(error);
  });

  child.on('close', (code) => {
    if (code === 0) {
      resolve({ stdout, stderr });
      return;
    }

    reject(new Error(stderr.trim() || stdout.trim() || `ffmpeg exited with code ${code}`));
  });
});

const extractFrameAtTime = (inputPath, outputPath, seconds) => runFfmpeg([
  '-y',
  '-ss', seconds,
  '-i', inputPath,
  '-frames:v', '1',
  outputPath,
]);

const generateSeamDifferenceImage = (startFramePath, endFramePath, outputPath) => runFfmpeg([
  '-y',
  '-i', startFramePath,
  '-i', endFramePath,
  '-filter_complex', '[0:v][1:v]blend=all_mode=difference',
  outputPath,
]);

const measureSeamSimilarity = async (startFramePath, endFramePath) => {
  const { stderr } = await runFfmpegCapture([
    '-i', startFramePath,
    '-i', endFramePath,
    '-lavfi', 'ssim',
    '-f', 'null',
    '-',
  ]);

  const match = stderr.match(/All:([0-9.]+)/);
  return match ? Number.parseFloat(match[1]) : null;
};

const extractFrameNearEnd = async (inputPath, outputPath) => {
  try {
    await runFfmpeg([
      '-y',
      '-sseof', `-${endOffsetSeconds}`,
      '-i', inputPath,
      '-frames:v', '1',
      outputPath,
    ]);
  } catch (error) {
    await extractFrameAtTime(inputPath, outputPath, timestampSeconds);
    return {
      extractionMode: 'fallback-start-frame',
      extractionNotes: `ffmpeg could not seek near the end of the loop, so the start frame was reused for seam review (${error instanceof Error ? error.message : String(error)}).`,
    };
  }

  return {
    extractionMode: 'end-offset',
    extractionNotes: `End frame extracted ${endOffsetSeconds}s before the loop ended for seamless-loop review.`,
  };
};

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
  const seamEndOutputPath = path.join(stateOutputDir, `${job.stateId}-${job.variant}-frame-end.png`);
  const seamDiffOutputPath = path.join(stateOutputDir, `${job.stateId}-${job.variant}-frame-diff.png`);
  await ensureDir(stateOutputDir);

  if (!(await exists(inputPath))) {
    results.push({
      stateId: job.stateId,
      stateIndex: job.stateIndex,
      label: job.label,
      variant: job.variant,
      source: job.loopTargetFilesystemPath,
      reviewFrame: relativeFromRoot(outputPath),
      seamEndFrame: relativeFromRoot(seamEndOutputPath),
      seamDiffFrame: relativeFromRoot(seamDiffOutputPath),
      seamStatus: 'missing-loop-file',
      seamNotes: 'No seam end-frame could be extracted because the loop MP4 is missing on this host.',
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

  if (!overwrite && (await exists(outputPath)) && (await exists(seamEndOutputPath))) {
    const seamSimilarity = await exists(seamDiffOutputPath)
      ? await measureSeamSimilarity(outputPath, seamEndOutputPath).catch(() => null)
      : null;
    results.push({
      stateId: job.stateId,
      stateIndex: job.stateIndex,
      label: job.label,
      variant: job.variant,
      source: job.loopTargetFilesystemPath,
      reviewFrame: relativeFromRoot(outputPath),
      seamEndFrame: relativeFromRoot(seamEndOutputPath),
      seamDiffFrame: relativeFromRoot(seamDiffOutputPath),
      seamStatus: staleStatus ?? 'ready-for-comparison',
      seamSimilarity,
      seamNotes: staleNotes ?? `Compare the start frame at ${timestampSeconds}s against the end frame extracted ${endOffsetSeconds}s before the loop ends; they should land in the same composition without restart snap.${seamSimilarity !== null ? ` Current SSIM: ${seamSimilarity.toFixed(4)} (closer to 1.0 is better).` : ''}`,
      extractedAt,
      generationStatus: generation?.status ?? 'not-recorded',
      generationNotes: generation?.notes ?? null,
      status: staleStatus ?? 'already-exists',
      notes: staleNotes ?? 'Review frames already existed; rerun with --overwrite to replace them.'
    });
    continue;
  }

  try {
    await extractFrameAtTime(inputPath, outputPath, timestampSeconds);
    const seamExtraction = await extractFrameNearEnd(inputPath, seamEndOutputPath);
    await generateSeamDifferenceImage(outputPath, seamEndOutputPath, seamDiffOutputPath);
    const seamSimilarity = await measureSeamSimilarity(outputPath, seamEndOutputPath);
    results.push({
      stateId: job.stateId,
      stateIndex: job.stateIndex,
      label: job.label,
      variant: job.variant,
      source: job.loopTargetFilesystemPath,
      reviewFrame: relativeFromRoot(outputPath),
      seamEndFrame: relativeFromRoot(seamEndOutputPath),
      seamDiffFrame: relativeFromRoot(seamDiffOutputPath),
      seamStatus: staleStatus ?? 'ready-for-comparison',
      seamSimilarity,
      seamNotes: staleStatus ?? `${seamExtraction.extractionNotes} SSIM: ${seamSimilarity !== null ? seamSimilarity.toFixed(4) : 'unavailable'} (closer to 1.0 is better).`,
      seamExtractionMode: seamExtraction.extractionMode,
      extractedAt,
      generationStatus: generation?.status ?? 'not-recorded',
      generationNotes: generation?.notes ?? null,
      status: staleStatus ?? 'extracted',
      notes: staleNotes ?? `Representative start frame extracted at ${timestampSeconds}s for visual loop review.`
    });
  } catch (error) {
    results.push({
      stateId: job.stateId,
      stateIndex: job.stateIndex,
      label: job.label,
      variant: job.variant,
      source: job.loopTargetFilesystemPath,
      reviewFrame: relativeFromRoot(outputPath),
      seamEndFrame: relativeFromRoot(seamEndOutputPath),
      seamDiffFrame: relativeFromRoot(seamDiffOutputPath),
      seamStatus: 'failed',
      seamNotes: error instanceof Error ? error.message : String(error),
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
  '| State | Label | Variant | Review status | Seam status | SSIM | Generation | Loop MP4 | Start frame | End frame | Diff frame | Notes |',
  '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ...results.map((item) => `| ${item.stateId.replace('state-', '')} | ${item.label} | ${item.variant.toUpperCase()} | ${item.status} | ${item.seamStatus ?? 'not-recorded'} | ${item.seamSimilarity !== null && item.seamSimilarity !== undefined ? item.seamSimilarity.toFixed(4) : '—'} | ${item.generationStatus ?? 'not-recorded'} | ${item.source} | ${item.reviewFrame} | ${item.seamEndFrame ?? '—'} | ${item.seamDiffFrame ?? '—'} | ${(item.seamNotes ?? item.notes).replace(/\|/g, '\\|')} |`)
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
  '    .frame-pair { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-bottom: 12px; }',
  '    figure { margin: 0; }',
  '    figcaption { color: #aab6cc; font-size: 12px; margin-top: 6px; }',
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
    const seamEndFrameAbsolute = item.seamEndFrame ? resolveFromRoot(item.seamEndFrame) : null;
    const seamEndFrameRelativeToHtml = seamEndFrameAbsolute ? path.relative(path.dirname(reportHtmlPath), seamEndFrameAbsolute).replace(/\\/g, '/') : null;
    const seamDiffFrameAbsolute = item.seamDiffFrame ? resolveFromRoot(item.seamDiffFrame) : null;
    const seamDiffFrameRelativeToHtml = seamDiffFrameAbsolute ? path.relative(path.dirname(reportHtmlPath), seamDiffFrameAbsolute).replace(/\\/g, '/') : null;
    const statusClass = item.status === 'stale-source-loop' ? 'status stale' : item.status === 'failed' ? 'status failed' : 'status';
    const seamStatusClass = item.seamStatus === 'failed' ? 'status failed' : item.seamStatus === 'missing-loop-file' ? 'status failed' : item.status === 'stale-source-loop' ? 'status stale' : 'status';
    const isImageSafe = item.status === 'extracted' || item.status === 'already-exists' || item.status === 'stale-source-loop';
    const hasSeamEndFrame = Boolean(seamEndFrameRelativeToHtml) && (item.seamStatus === 'ready-for-comparison' || item.status === 'stale-source-loop' || item.status === 'already-exists');
    const hasDiffFrame = Boolean(seamDiffFrameRelativeToHtml) && (item.seamStatus === 'ready-for-comparison' || item.status === 'stale-source-loop' || item.status === 'already-exists');
    return [
      '    <section class="card">',
      `      <h2>${escapeHtml(item.stateId)} · ${escapeHtml(item.label)} · ${escapeHtml(item.variant.toUpperCase())}</h2>`,
      `      <div class="${statusClass}">${escapeHtml(item.status)}</div>`,
      `      <div class="${seamStatusClass}">${escapeHtml(item.seamStatus ?? 'no-seam-status')}</div>`,
      item.status === 'stale-source-loop'
        ? `      <p class="warning">${escapeHtml(item.notes)}</p>`
        : '',
      isImageSafe
        ? [
            '      <div class="frame-pair">',
            '        <figure>',
            `          <img src="${escapeHtml(reviewFrameRelativeToHtml)}" alt="${escapeHtml(`${item.stateId} ${item.label} ${item.variant} start review frame`)}" />`,
            `          <figcaption>Start frame (${escapeHtml(timestampSeconds)}s)</figcaption>`,
            '        </figure>',
            hasSeamEndFrame
              ? [
                  '        <figure>',
                  `          <img src="${escapeHtml(seamEndFrameRelativeToHtml)}" alt="${escapeHtml(`${item.stateId} ${item.label} ${item.variant} end review frame`)}" />`,
                  `          <figcaption>End frame (-${escapeHtml(endOffsetSeconds)}s from end)</figcaption>`,
                  '        </figure>'
                ].join('\n')
              : '        <p>No end-frame seam image available.</p>',
            hasDiffFrame
              ? [
                  '        <figure>',
                  `          <img src="${escapeHtml(seamDiffFrameRelativeToHtml)}" alt="${escapeHtml(`${item.stateId} ${item.label} ${item.variant} seam difference frame`)}" />`,
                  `          <figcaption>Difference heatmap${item.seamSimilarity !== null && item.seamSimilarity !== undefined ? ` · SSIM ${escapeHtml(item.seamSimilarity.toFixed(4))}` : ''}</figcaption>`,
                  '        </figure>'
                ].join('\n')
              : '        <p>No seam difference image available.</p>',
            '      </div>'
          ].join('\n')
        : '      <p>No review image available.</p>',
      '      <ul>',
      `        <li><strong>Generation:</strong> <code>${escapeHtml(item.generationStatus ?? 'not-recorded')}</code></li>`,
      `        <li><strong>Loop MP4:</strong> <code>${escapeHtml(item.source)}</code></li>`,
      `        <li><strong>Start frame:</strong> <code>${escapeHtml(item.reviewFrame)}</code></li>`,
      `        <li><strong>End frame:</strong> <code>${escapeHtml(item.seamEndFrame ?? 'not-available')}</code></li>`,
      `        <li><strong>Diff frame:</strong> <code>${escapeHtml(item.seamDiffFrame ?? 'not-available')}</code></li>`,
      `        <li><strong>SSIM:</strong> ${escapeHtml(item.seamSimilarity !== null && item.seamSimilarity !== undefined ? item.seamSimilarity.toFixed(4) : 'not-available')}</li>`,
      `        <li><strong>Seam review:</strong> ${escapeHtml(item.seamNotes ?? 'Compare the start and end frames for seamless-loop acceptance.')}</li>`,
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

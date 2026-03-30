import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = process.cwd();
const outputDir = path.join(root, 'data', 'generated');
const reportJsonPath = path.join(outputDir, 'paper-money-rerender-report.json');
const reportMdPath = path.join(outputDir, 'paper-money-rerender-report.md');
const regressionTerms = [
  'paper money',
  'floating money',
  'cash',
  'money motion',
  'money flutter',
  'money swirling',
  'paper-money',
];
const regressionScanTargets = [
  path.join(root, 'data', 'state-prompts.json'),
  path.join(outputDir, 'canonical-asset-checklist.json'),
  path.join(outputDir, 'canonical-asset-batch.json'),
  path.join(outputDir, 'canonical-loop-render-jobs.json'),
  path.join(outputDir, 'canonical-loop-generation-results.json'),
  path.join(outputDir, 'loop-review-frames.json'),
];

const statesArg = process.argv.find((arg) => arg.startsWith('--states='));
const variantArg = process.argv.find((arg) => arg.startsWith('--variant='));
const prepOnly = process.argv.includes('--prep-only');
const overwriteReviewFrames = process.argv.includes('--overwrite-review-frames') || process.argv.includes('--overwrite');
const selectedStates = (statesArg ? statesArg.split('=')[1] : 'state-01,state-10,state-20')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const selectedVariant = (variantArg ? variantArg.split('=')[1].trim().toLowerCase() : null) || null;
const hasFalKey = Boolean(process.env.FAL_KEY?.trim());
const startedAt = new Date().toISOString();

await fs.mkdir(outputDir, { recursive: true });

const quoteArg = (value) => {
  if (/^[A-Za-z0-9._:/=-]+$/.test(value)) return value;
  return JSON.stringify(value);
};

const runNodeScript = (scriptRelativePath, args = []) => new Promise((resolve) => {
  const child = spawn(process.execPath, [scriptRelativePath, ...args], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });

  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    stdout += text;
    process.stdout.write(text);
  });

  child.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    stderr += text;
    process.stderr.write(text);
  });

  child.on('error', (error) => {
    resolve({ code: 1, stdout, stderr: `${stderr}\n${error instanceof Error ? error.message : String(error)}`.trim() });
  });

  child.on('close', (code) => {
    resolve({ code: code ?? 1, stdout, stderr });
  });
});

const readJsonIfExists = async (targetPath) => {
  try {
    return JSON.parse(await fs.readFile(targetPath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
};

const readTextIfExists = async (targetPath) => {
  try {
    return await fs.readFile(targetPath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
};

const relativeFromRoot = (targetPath) => path.relative(root, targetPath).replace(/\\/g, '/');

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const runRegressionScan = async () => {
  const matches = [];

  for (const targetPath of regressionScanTargets) {
    const text = await readTextIfExists(targetPath);
    if (!text) continue;

    for (const term of regressionTerms) {
      const pattern = new RegExp(escapeRegExp(term), 'gi');
      const occurrences = text.match(pattern)?.length ?? 0;
      if (occurrences > 0) {
        matches.push({
          path: relativeFromRoot(targetPath),
          term,
          occurrences,
        });
      }
    }
  }

  return {
    terms: regressionTerms,
    scannedFiles: regressionScanTargets.map(relativeFromRoot),
    totalMatches: matches.reduce((sum, item) => sum + item.occurrences, 0),
    matches,
  };
};

const steps = [];
const generationResults = [];
const reviewResults = [];
const addStep = (step) => {
  steps.push(step);
};

const prepArgs = [`--force-loop-states=${selectedStates.join(',')}`];
addStep({
  kind: 'prepare',
  command: `${quoteArg(process.execPath)} scripts/prepare-canonical-assets.mjs ${prepArgs.map(quoteArg).join(' ')}`,
  ...(await runNodeScript('scripts/prepare-canonical-assets.mjs', prepArgs)),
});

if (!prepOnly) {
  for (const state of selectedStates) {
    const generateArgs = [`--state=${state}`];
    if (selectedVariant) generateArgs.push(`--variant=${selectedVariant}`);
    const stepResult = {
      kind: 'generate-loop',
      stateId: state,
      variant: selectedVariant,
      command: `${quoteArg(process.execPath)} scripts/run-loop-generation-jobs.mjs ${generateArgs.map(quoteArg).join(' ')}`,
      ...(await runNodeScript('scripts/run-loop-generation-jobs.mjs', generateArgs)),
    };
    addStep(stepResult);

    const latestLoopResults = await readJsonIfExists(path.join(outputDir, 'canonical-loop-generation-results.json'));
    if (Array.isArray(latestLoopResults)) {
      generationResults.push(
        ...latestLoopResults.filter((job) => job.stateId === state && (!selectedVariant || job.variant === selectedVariant))
      );
    }
  }
}

const reviewArgs = [`--states=${selectedStates.join(',')}`];
if (selectedVariant) reviewArgs.push(`--variant=${selectedVariant}`);
if (overwriteReviewFrames) reviewArgs.push('--overwrite');
addStep({
  kind: 'review-frames',
  command: `${quoteArg(process.execPath)} scripts/extract-loop-review-frames.mjs ${reviewArgs.map(quoteArg).join(' ')}`,
  ...(await runNodeScript('scripts/extract-loop-review-frames.mjs', reviewArgs)),
});

const latestReviewResults = await readJsonIfExists(path.join(outputDir, 'loop-review-frames.json'));
if (Array.isArray(latestReviewResults)) {
  reviewResults.push(
    ...latestReviewResults.filter((job) => selectedStates.includes(job.stateId) && (!selectedVariant || job.variant === selectedVariant))
  );
}

const queue = await readJsonIfExists(path.join(outputDir, 'canonical-loop-render-jobs.json'));

const matchingQueue = Array.isArray(queue)
  ? queue.filter((job) => selectedStates.includes(job.stateId) && (!selectedVariant || job.variant === selectedVariant))
  : [];
const matchingLoopResults = generationResults;
const matchingReviewResults = reviewResults;
const generationResultByStateVariant = new Map(
  matchingLoopResults.map((item) => [`${item.stateId}:${item.variant ?? ''}`, item])
);
const reviewResultByStateVariant = new Map(
  matchingReviewResults.map((item) => [`${item.stateId}:${item.variant ?? ''}`, item])
);
const reviewChecklist = matchingQueue.map((job) => {
  const key = `${job.stateId}:${job.variant ?? ''}`;
  const generation = generationResultByStateVariant.get(key) ?? null;
  const review = reviewResultByStateVariant.get(key) ?? null;
  const reviewFrame = review?.reviewFrame ?? null;
  const reviewFrameFilesystemPath = reviewFrame ? path.join(root, reviewFrame.replace(/\//g, path.sep)) : null;
  return {
    stateId: job.stateId,
    stateIndex: job.stateIndex,
    label: job.label,
    variant: job.variant,
    target: job.loopTargetFilesystemPath,
    targetFilesystemPath: path.join(root, job.loopTargetFilesystemPath.replace(/\//g, path.sep)),
    generationStatus: generation?.status ?? 'not-recorded',
    generationNotes: generation?.notes ?? null,
    reviewFrame,
    reviewFrameFilesystemPath,
    reviewStatus: review?.status ?? 'not-recorded',
    reviewNotes: review?.notes ?? null,
  };
});

const regressionScan = await runRegressionScan();

const summary = {
  startedAt,
  finishedAt: new Date().toISOString(),
  states: selectedStates,
  variant: selectedVariant,
  prepOnly,
  hasFalKey,
  queueJobs: matchingQueue.length,
  generatedCount: matchingLoopResults.filter((item) => item.status === 'generated').length,
  blockedMissingFalKeyCount: matchingLoopResults.filter((item) => item.status === 'blocked-missing-fal-key').length,
  failedGenerationCount: matchingLoopResults.filter((item) => item.status === 'failed').length,
  extractedReviewFramesCount: matchingReviewResults.filter((item) => item.status === 'extracted').length,
  missingLoopFileReviewCount: matchingReviewResults.filter((item) => item.status === 'missing-loop-file').length,
  failedReviewCount: matchingReviewResults.filter((item) => item.status === 'failed').length,
  regressionScan,
  reviewChecklist,
  steps,
};

await fs.writeFile(reportJsonPath, `${JSON.stringify(summary, null, 2)}\n`);

const rerunCommand = `npm run rerender:paper-money -- --states=${summary.states.join(',')}${summary.variant ? ` --variant=${summary.variant}` : ''} --overwrite-review-frames`;

const mdLines = [
  '# Paper-money rerender report',
  '',
  'Generated by `npm run rerender:paper-money`.',
  '',
  '## Re-run this batch',
  '',
  '```bash',
  rerunCommand,
  '```',
  '',
  `Started: ${summary.startedAt}`,
  `Finished: ${summary.finishedAt}`,
  `States: ${summary.states.join(', ')}`,
  `Variant: ${summary.variant ?? 'all queued variants'}`,
  `Prep only: ${summary.prepOnly ? 'yes' : 'no'}`,
  `FAL_KEY present: ${summary.hasFalKey ? 'yes' : 'no'}`,
  `Queued jobs in scope: ${summary.queueJobs}`,
  `Generated loops: ${summary.generatedCount}`,
  `Blocked (missing FAL_KEY): ${summary.blockedMissingFalKeyCount}`,
  `Failed generations: ${summary.failedGenerationCount}`,
  `Extracted review frames: ${summary.extractedReviewFramesCount}`,
  `Missing-loop review frames: ${summary.missingLoopFileReviewCount}`,
  `Failed review frames: ${summary.failedReviewCount}`,
  `Paper-money regression matches: ${summary.regressionScan.totalMatches}`,
  '',
  '## Metadata regression scan',
  '',
  `Scanned files: ${summary.regressionScan.scannedFiles.length}`,
  `Terms: ${summary.regressionScan.terms.join(', ')}`,
  `Matches: ${summary.regressionScan.totalMatches}`,
  '',
  ...(summary.regressionScan.matches.length > 0
    ? [
        '| File | Term | Occurrences |',
        '| --- | --- | --- |',
        ...summary.regressionScan.matches.map((item) => `| \`${item.path}\` | ${item.term} | ${item.occurrences} |`),
        '',
      ]
    : [
        'No paper-money regression phrases were found in the scanned prompt/queue/result/report files.',
        '',
      ]),
  '## Review checklist',
  '',
  '| State | Label | Variant | Loop target | Review frame | Generation | Review status |',
  '| --- | --- | --- | --- | --- | --- | --- |',
  ...summary.reviewChecklist.map((item) => `| ${item.stateId} | ${item.label} | ${String(item.variant ?? '').toUpperCase() || '—'} | \`${item.target}\` | ${item.reviewFrame ? `\`${item.reviewFrame}\`` : '—'} | ${item.generationStatus} | ${item.reviewStatus} |`),
  '',
  '### Acceptance notes',
  '',
  ...summary.reviewChecklist.flatMap((item) => [
    `- ${item.stateId}${item.variant ? `/${item.variant}` : ''}: open ${item.reviewFrame ? `\`${item.reviewFrame}\`` : 'the extracted review frame'} and compare it against \`${item.target}\` before re-approval.`,
    `  - Loop file: \`${item.targetFilesystemPath}\``,
    ...(item.reviewFrameFilesystemPath ? [`  - Review frame file: \`${item.reviewFrameFilesystemPath}\``] : []),
    ...(item.generationNotes ? [`  - Generation: ${item.generationNotes}`] : []),
    ...(item.reviewNotes ? [`  - Review: ${item.reviewNotes}`] : []),
  ]),
  '',
  '## Steps',
  '',
  '| Step | Scope | Exit code | Command |',
  '| --- | --- | --- | --- |',
  ...steps.map((step) => `| ${step.kind} | ${step.stateId ? `${step.stateId}${step.variant ? `/${step.variant}` : ''}` : summary.states.join(', ')} | ${step.code} | \`${step.command.replace(/\|/g, '\\|')}\` |`),
  '',
  '## Output artifacts',
  '',
  '- `data/generated/canonical-loop-render-jobs.json`',
  '- `data/generated/canonical-loop-generation-results.json`',
  '- `data/generated/loop-review-frames.json`',
  `- \`${relativeFromRoot(reportJsonPath)}\``,
  `- \`${relativeFromRoot(reportMdPath)}\``,
  '',
  '## Acceptance checklist',
  '',
  '- [ ] Confirm replacement generation actually ran on a host with `FAL_KEY` (the generation status should no longer be `blocked-missing-fal-key`).',
  '- [ ] Open each listed review-frame PNG and confirm paper-money imagery is gone in the replacement `loop-b` output.',
  '- [ ] Verify the rerender metadata/results still contain 0 paper-money regressions before re-approving the loops (`Paper-money regression matches: 0` in this report).',
  '- [ ] Only widen rerender scope beyond states 01 / 10 / 20 after the targeted batch passes the visual review.',
  '',
  '## Next action',
  '',
  hasFalKey
    ? 'Visually inspect the extracted replacement frames and confirm paper-money imagery is gone before re-approving the rerendered loops.'
    : 'Run the same command on the first host with `FAL_KEY` so the queued rerender batch can actually produce replacement MP4s, then inspect the extracted replacement frames before re-approval.'
];

await fs.writeFile(reportMdPath, `${mdLines.join('\n')}\n`);

console.log(`Wrote ${relativeFromRoot(reportJsonPath)} and ${relativeFromRoot(reportMdPath)}.`);

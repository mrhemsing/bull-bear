import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = process.cwd();
const outputDir = path.join(root, 'data', 'generated');
const reportJsonPath = path.join(outputDir, 'paper-money-rerender-report.json');
const reportMdPath = path.join(outputDir, 'paper-money-rerender-report.md');
const nextActionsJsonPath = path.join(outputDir, 'canonical-production-next-actions.json');
const assetChecklistJsonPath = path.join(outputDir, 'canonical-asset-checklist.json');
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
const seamSimilarityWarningThreshold = 0.9;

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

const statesArg = process.argv.find((arg) => arg.startsWith('--states='));
const variantArg = process.argv.find((arg) => arg.startsWith('--variant='));
const timeoutArg = process.argv.find((arg) => arg.startsWith('--timeout-ms='));
const modelArg = process.argv.find((arg) => arg.startsWith('--model='));
const prepOnly = process.argv.includes('--prep-only');
const overwriteReviewFrames = process.argv.includes('--overwrite-review-frames') || process.argv.includes('--overwrite');
const selectedStates = (statesArg ? statesArg.split('=')[1] : 'state-01,state-10,state-20')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const selectedVariant = (variantArg ? variantArg.split('=')[1].trim().toLowerCase() : null) || null;
const selectedTimeoutMs = timeoutArg ? timeoutArg.split('=')[1].trim() : (process.env.FAL_VIDEO_TIMEOUT_MS?.trim() || null);
const selectedModel = modelArg ? modelArg.split('=')[1].trim() : (process.env.FAL_VIDEO_MODEL?.trim() || 'fal-ai/minimax/video-01/image-to-video');
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
    env: {
      ...process.env,
      ...(selectedTimeoutMs ? { FAL_VIDEO_TIMEOUT_MS: selectedTimeoutMs } : {}),
      ...(selectedModel ? { FAL_VIDEO_MODEL: selectedModel } : {}),
    },
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
    if (selectedTimeoutMs) generateArgs.push(`--timeout-ms=${selectedTimeoutMs}`);
    if (selectedModel) generateArgs.push(`--model=${selectedModel}`);
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
const canonicalNextActions = await readJsonIfExists(nextActionsJsonPath);
const canonicalAssetChecklist = await readJsonIfExists(assetChecklistJsonPath);

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
  const seamEndFrame = review?.seamEndFrame ?? null;
  const seamDiffFrame = review?.seamDiffFrame ?? null;
  const seamSimilarity = review?.seamSimilarity ?? null;
  const reviewFrameFilesystemPath = reviewFrame ? path.join(root, reviewFrame.replace(/\//g, path.sep)) : null;
  const seamEndFrameFilesystemPath = seamEndFrame ? path.join(root, seamEndFrame.replace(/\//g, path.sep)) : null;
  const seamDiffFrameFilesystemPath = seamDiffFrame ? path.join(root, seamDiffFrame.replace(/\//g, path.sep)) : null;
  const seamRisk = seamSimilarity !== null && seamSimilarity < seamSimilarityWarningThreshold;
  const generationStatus = generation?.status ?? (prepOnly ? 'prep-only-existing-loop' : 'not-recorded');
  const generationNotes = generation?.notes ?? (prepOnly
    ? 'Prep-only mode skipped loop generation and refreshed review evidence against the existing on-disk loop file.'
    : null);
  return {
    stateId: job.stateId,
    stateIndex: job.stateIndex,
    label: job.label,
    variant: job.variant,
    target: job.loopTargetFilesystemPath,
    targetFilesystemPath: path.join(root, job.loopTargetFilesystemPath.replace(/\//g, path.sep)),
    generationStatus,
    generationNotes,
    generationModel: generation?.model ?? selectedModel,
    reviewFrame,
    seamEndFrame,
    seamDiffFrame,
    reviewFrameFilesystemPath,
    seamEndFrameFilesystemPath,
    seamDiffFrameFilesystemPath,
    reviewStatus: review?.status ?? 'not-recorded',
    seamStatus: review?.seamStatus ?? 'not-recorded',
    seamSimilarity,
    seamRisk,
    reviewNotes: review?.notes ?? null,
    seamNotes: review?.seamNotes ?? null,
  };
});

const regressionScan = await runRegressionScan();

const nextActions = Array.isArray(canonicalNextActions) ? canonicalNextActions : [];
const canonicalLoopApprovalByStateVariant = new Map(
  (Array.isArray(canonicalAssetChecklist) ? canonicalAssetChecklist : []).flatMap((state) =>
    (Array.isArray(state?.loops) ? state.loops : []).map((loop) => {
      const match = String(loop?.target ?? '').match(/\/states\/(state-\d+)\/loop-([a-z])\.mp4$/i);
      return match
        ? [`${match[1]}:${match[2].toLowerCase()}`, {
            status: String(loop?.status ?? ''),
            approved: String(loop?.status ?? '').toLowerCase() === 'approved',
            target: String(loop?.target ?? ''),
          }]
        : null;
    }).filter(Boolean)
  )
);

const summary = {
  startedAt,
  finishedAt: new Date().toISOString(),
  states: selectedStates,
  variant: selectedVariant,
  prepOnly,
  hasFalKey,
  model: selectedModel,
  timeoutMs: selectedTimeoutMs ? Number.parseInt(selectedTimeoutMs, 10) : null,
  queueJobs: matchingQueue.length,
  canonicalNextActionsCount: nextActions.length,
  canonicalNextActions: nextActions,
  generatedCount: matchingLoopResults.filter((item) => item.status === 'generated').length,
  blockedMissingFalKeyCount: matchingLoopResults.filter((item) => item.status === 'blocked-missing-fal-key').length,
  failedGenerationCount: matchingLoopResults.filter((item) => item.status === 'failed').length,
  extractedReviewFramesCount: matchingReviewResults.filter((item) => item.status === 'extracted').length,
  staleReviewFramesCount: matchingReviewResults.filter((item) => item.status === 'stale-source-loop').length,
  missingLoopFileReviewCount: matchingReviewResults.filter((item) => item.status === 'missing-loop-file').length,
  failedReviewCount: matchingReviewResults.filter((item) => item.status === 'failed').length,
  seamReadyCount: reviewChecklist.filter((item) => item.seamStatus === 'ready-for-comparison' || item.seamStatus === 'comparison-ready').length,
  seamBlockedCount: reviewChecklist.filter((item) => item.seamStatus !== 'ready-for-comparison' && item.seamStatus !== 'comparison-ready').length,
  seamRiskWarningCount: reviewChecklist.filter((item) => item.seamRisk).length,
  regressionScan,
  reviewChecklist,
  reportJson: relativeFromRoot(reportJsonPath),
  reportMd: relativeFromRoot(reportMdPath),
  reviewGallery: 'data/generated/loop-review-frames.html',
  reportJsonFilesystemPath: reportJsonPath,
  reportMdFilesystemPath: reportMdPath,
  reviewGalleryFilesystemPath: path.join(outputDir, 'loop-review-frames.html'),
  steps,
};

const objectivelyAcceptanceClean =
  summary.staleReviewFramesCount === 0
  && summary.seamBlockedCount === 0
  && summary.seamRiskWarningCount === 0
  && summary.regressionScan.totalMatches === 0
  && summary.failedGenerationCount === 0
  && summary.failedReviewCount === 0
  && summary.missingLoopFileReviewCount === 0;

const allReviewStatusesFresh = summary.reviewChecklist.every((item) => item.reviewStatus !== 'stale-source-loop');
const allSeamStatusesReady = summary.reviewChecklist.every(
  (item) => item.seamStatus === 'ready-for-comparison' || item.seamStatus === 'comparison-ready'
);
const noSeamRiskWarnings = summary.seamRiskWarningCount === 0;
const zeroPaperMoneyRegressions = summary.regressionScan.totalMatches === 0;
const generationRanWithFalKey = !summary.prepOnly && summary.hasFalKey && summary.blockedMissingFalKeyCount === 0;
const checklistApprovalCoverage = summary.reviewChecklist.map((item) => {
  const checklistEntry = canonicalLoopApprovalByStateVariant.get(`${item.stateId}:${String(item.variant ?? '').toLowerCase()}`) ?? null;
  return {
    stateId: item.stateId,
    variant: item.variant,
    target: item.target,
    approvedInCanonicalChecklist: Boolean(checklistEntry?.approved),
    canonicalChecklistStatus: checklistEntry?.status ?? null,
  };
});
const allTargetLoopsAlreadyApprovedInCanonicalChecklist =
  checklistApprovalCoverage.length > 0 && checklistApprovalCoverage.every((item) => item.approvedInCanonicalChecklist);
const manualReapprovalStillRequired = !(
  summary.prepOnly
  && objectivelyAcceptanceClean
  && summary.canonicalNextActionsCount === 0
  && allTargetLoopsAlreadyApprovedInCanonicalChecklist
);
const remainingManualAcceptanceSteps = manualReapprovalStillRequired
  ? [
      'Reopen this report and use it as the source of truth for acceptance.',
      'Open the review gallery or the listed PNG review frames and confirm paper-money imagery is gone in the replacement output.',
      'Compare the extracted start/end frames and reject any loop where composition, subject position, or environment does not land back in the same place without visible restart snap.',
    ]
  : [];

await fs.writeFile(reportJsonPath, `${JSON.stringify({
  ...summary,
  objectivelyAcceptanceClean,
  checklistAutomation: {
    allReviewStatusesFresh,
    allSeamStatusesReady,
    noSeamRiskWarnings,
    zeroPaperMoneyRegressions,
    generationRanWithFalKey,
  },
  checklistApprovalCoverage,
  allTargetLoopsAlreadyApprovedInCanonicalChecklist,
  manualReapprovalStillRequired,
  remainingManualAcceptanceSteps,
}, null, 2)}\n`);

const rerunCommand = `npm run rerender:paper-money -- --states=${summary.states.join(',')}${summary.variant ? ` --variant=${summary.variant}` : ''}${summary.model ? ` --model=${summary.model}` : ''}${summary.timeoutMs ? ` --timeout-ms=${summary.timeoutMs}` : ''} --overwrite-review-frames`;

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
  `Model override: ${summary.model}`,
  `Timeout override ms: ${summary.timeoutMs ?? 'default'}`,
  `Queued jobs in scope: ${summary.queueJobs}`,
  `Generated loops: ${summary.generatedCount}`,
  `Blocked (missing FAL_KEY): ${summary.blockedMissingFalKeyCount}`,
  `Failed generations: ${summary.failedGenerationCount}`,
  `Extracted review frames: ${summary.extractedReviewFramesCount}`,
  `Stale review frames: ${summary.staleReviewFramesCount}`,
  `Missing-loop review frames: ${summary.missingLoopFileReviewCount}`,
  `Failed review frames: ${summary.failedReviewCount}`,
  `Seam-review ready frames: ${summary.seamReadyCount}`,
  `Seam-review blocked frames: ${summary.seamBlockedCount}`,
  `Seam-risk warnings: ${summary.seamRiskWarningCount}`,
  `Paper-money regression matches: ${summary.regressionScan.totalMatches}`,
  '',
  ...(summary.seamRiskWarningCount > 0
    ? [
        '## Seam-risk warnings',
        '',
        `- ${summary.seamRiskWarningCount} loop(s) have seam SSIM below ${seamSimilarityWarningThreshold.toFixed(2)}. Treat these as suspicious and do not approve them without a strict manual seam check against the diff/start/end frames.`,
        '',
      ]
    : []),
  '## Batch artifacts',
  '',
  `- Report (Markdown): \`${summary.reportMd}\``,
  `- Report file: \`${summary.reportMdFilesystemPath}\``,
  `- Report (JSON): \`${summary.reportJson}\``,
  `- Report file: \`${summary.reportJsonFilesystemPath}\``,
  `- Review gallery (HTML): \`${summary.reviewGallery}\``,
  `- Review gallery file: \`${summary.reviewGalleryFilesystemPath}\``,
  '',
  'Reopen this Markdown report after running the batch on a keyed host; it is the canonical acceptance artifact for the targeted rerender pass.',
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
  '| State | Label | Variant | Loop target | Start frame | End frame | Diff frame | SSIM | Seam risk | Generation | Review status | Seam status |',
  '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ...summary.reviewChecklist.map((item) => `| ${item.stateId} | ${item.label} | ${String(item.variant ?? '').toUpperCase() || '—'} | \`${item.target}\` | ${item.reviewFrame ? `\`${item.reviewFrame}\`` : '—'} | ${item.seamEndFrame ? `\`${item.seamEndFrame}\`` : '—'} | ${item.seamDiffFrame ? `\`${item.seamDiffFrame}\`` : '—'} | ${item.seamSimilarity !== null && item.seamSimilarity !== undefined ? item.seamSimilarity.toFixed(4) : '—'} | ${item.seamRisk ? 'warning' : 'ok'} | ${item.generationStatus} | ${item.reviewStatus} | ${item.seamStatus} |`),
  '',
  '### Acceptance notes',
  '',
  ...summary.reviewChecklist.flatMap((item) => [
    `- ${item.stateId}${item.variant ? `/${item.variant}` : ''}: ${item.reviewStatus === 'stale-source-loop' ? 'do not use the extracted frames as fresh acceptance proof until generation succeeds; they may still reflect the prior on-disk loop.' : item.seamRisk ? `seam drift is suspicious (SSIM ${item.seamSimilarity?.toFixed(4) ?? 'n/a'} < ${seamSimilarityWarningThreshold.toFixed(2)}). Treat this loop as not acceptance-safe until a strict manual seam check passes against the start/end/diff frames.` : `open the extracted start/end review frames and compare them against \`${item.target}\` before re-approval.`}`,
    `  - Generation model: \`${item.generationModel}\``,
    `  - Review gallery: \`${summary.reviewGallery}\``,
    `  - Open review gallery directly: \`start "" "${summary.reviewGalleryFilesystemPath}"\``,
    `  - Loop file: \`${item.targetFilesystemPath}\``,
    ...(item.reviewFrameFilesystemPath ? [`  - Start review frame file: \`${item.reviewFrameFilesystemPath}\``] : []),
    ...(item.reviewFrameFilesystemPath ? [`  - Open start review frame directly: \`start "" "${item.reviewFrameFilesystemPath}"\``] : []),
    ...(item.seamEndFrameFilesystemPath ? [`  - End review frame file: \`${item.seamEndFrameFilesystemPath}\``] : []),
    ...(item.seamEndFrameFilesystemPath ? [`  - Open end review frame directly: \`start "" "${item.seamEndFrameFilesystemPath}"\``] : []),
    ...(item.seamDiffFrameFilesystemPath ? [`  - Seam diff frame file: \`${item.seamDiffFrameFilesystemPath}\``] : []),
    ...(item.seamDiffFrameFilesystemPath ? [`  - Open seam diff frame directly: \`start "" "${item.seamDiffFrameFilesystemPath}"\``] : []),
    ...(item.generationNotes ? [`  - Generation: ${item.generationNotes}`] : []),
    ...(item.reviewNotes ? [`  - Review: ${item.reviewNotes}`] : []),
    ...(item.seamSimilarity !== null && item.seamSimilarity !== undefined ? [`  - Seam SSIM: ${item.seamSimilarity.toFixed(4)} (closer to 1.0 is better; values below ${seamSimilarityWarningThreshold.toFixed(2)} should be treated as suspicious).`] : []),
    ...(item.seamNotes ? [`  - Seam review: ${item.seamNotes}`] : []),
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
  '- `data/generated/loop-review-frames.html`',
  `- \`${relativeFromRoot(reportJsonPath)}\``,
  `- \`${relativeFromRoot(reportMdPath)}\``,
  '',
  '## Acceptance checklist',
  '',
  manualReapprovalStillRequired
    ? 'Machine checks are already reflected below. Only the unchecked items remain manual.'
    : 'Machine checks are already reflected below. Manual re-approval is already satisfied here because this prep-only proof refresh is objectively clean, the canonical production queue is empty, and the targeted loop(s) are already marked `approved` in `data/generated/canonical-asset-checklist.json`.',
  '',
  ...(summary.prepOnly
    ? [
        '- [x] This run was `--prep-only`, so no fresh generation was attempted; treat the extracted frames as refreshed review proof for the existing on-disk loop, not as evidence of a new provider run.',
      ]
    : [
        `- [${generationRanWithFalKey ? 'x' : ' '}] Confirm replacement generation actually ran on a host with \`FAL_KEY\` (the generation status should no longer be \`blocked-missing-fal-key\`).`,
      ]),
  `- [${manualReapprovalStillRequired ? ' ' : 'x'}] Reopen this report and use it as the source of truth for acceptance (\`data/generated/paper-money-rerender-report.md\`).`,
  `- [${allReviewStatusesFresh ? 'x' : ' '}] If the review status is \`stale-source-loop\`, do not treat the extracted PNG/gallery as fresh rerender evidence; rerun generation successfully first.`,
  `- [${manualReapprovalStillRequired ? ' ' : 'x'}] Open the review gallery (\`data/generated/loop-review-frames.html\`) or each listed PNG pair and confirm paper-money imagery is gone in the replacement \`loop-b\` output.`,
  `- [${allSeamStatusesReady ? 'x' : ' '}] Confirm seam status is review-ready before trusting the extracted frame pair (\`ready-for-comparison\` / \`comparison-ready\`); if seam status is anything else, do not approve the loop yet.`,
  `- [${noSeamRiskWarnings ? 'x' : ' '}] If seam risk is \`warning\` or SSIM is below the threshold, do not approve the loop without a strict manual seam check against the start/end/diff frames.`,
  `- [${manualReapprovalStillRequired ? ' ' : 'x'}] Compare the extracted start/end frames for each loop and reject any rerender where the composition, animal position, or environment does not land back in the same place without a visible restart snap.`,
  `- [${zeroPaperMoneyRegressions ? 'x' : ' '}] Verify the rerender metadata/results still contain 0 paper-money regressions before re-approving the loops (\`Paper-money regression matches: ${summary.regressionScan.totalMatches}\` in this report).`,
  summary.canonicalNextActionsCount > 0
    ? `- [ ] After this targeted batch passes visual review, reopen \`data/generated/canonical-production-next-actions.md\` and continue with the remaining ${summary.canonicalNextActionsCount} queued production action(s).`
    : '- [x] The canonical production queue is currently clear (`data/generated/canonical-production-next-actions.md` shows 0 open actions), so there is no wider rerender scope to unlock right now.',
  '',
  '## Remaining manual acceptance steps',
  '',
  ...(remainingManualAcceptanceSteps.length > 0
    ? remainingManualAcceptanceSteps.map((step, index) => `${index + 1}. ${step}`)
    : ['None. This targeted proof refresh already lines up with the existing canonical `approved` status for the loop(s) in scope.']),
  '',
  '## Next action',
  '',
  summary.staleReviewFramesCount > 0
    ? `Generation has not produced fresh proof yet for ${summary.staleReviewFramesCount} review item(s); rerun the same command with model \`${summary.model}\`${summary.timeoutMs ? ` and the recorded ${summary.timeoutMs}ms timeout` : ''} until generation succeeds, then use the refreshed gallery/report for acceptance.`
    : summary.seamBlockedCount > 0
      ? `Fresh rerender output exists, but ${summary.seamBlockedCount} loop(s) are not seam-review ready yet. Regenerate or re-extract until the report shows seam status \`ready-for-comparison\` / \`comparison-ready\`, then do the visual approval pass.`
      : summary.seamRiskWarningCount > 0
        ? `${summary.seamRiskWarningCount} loop(s) have suspicious seam drift metrics. Do not widen scope yet; manually inspect the start/end/diff frames and only continue if the loop truly lands without restart snap despite the low SSIM signal.`
        : summary.prepOnly
          ? summary.canonicalNextActionsCount > 0
            ? `This prep-only proof refresh is objectively clean, but it does not replace the manual acceptance checklist. Reopen \`data/generated/canonical-production-next-actions.md\` after the listed visual checks and continue with the remaining ${summary.canonicalNextActionsCount} queued production action(s), starting with ${summary.canonicalNextActions[0]?.stateId ?? 'the next listed state'}.`
            : !manualReapprovalStillRequired
              ? 'This prep-only proof refresh is objectively clean, the canonical production queue is empty, and the targeted loop(s) are already approved in the canonical checklist. No remaining rerender or re-approval work is open from this report.'
              : objectivelyAcceptanceClean
                ? `This prep-only proof refresh is objectively clean and the canonical production queue is empty. Only ${remainingManualAcceptanceSteps.length} manual acceptance step(s) remain above; there is no new rerender work to unlock unless that visual check finds a defect.`
                : 'This prep-only proof refresh refreshed the review evidence, but it is not yet acceptance-clean. Use the checklist above to resolve the remaining review blockers before treating this cleanup pass as complete.'
          : !hasFalKey
            ? `Run the same command on the first host with \`FAL_KEY\`${summary.timeoutMs ? ` using the recorded timeout override (${summary.timeoutMs}ms)` : ''}, then reopen \`${summary.reportMd}\` and use the listed frame paths plus acceptance checklist before re-approval.`
            : summary.canonicalNextActionsCount > 0
              ? `This targeted rerender batch is objectively clean, but manual acceptance still governs approval. Reopen \`data/generated/canonical-production-next-actions.md\` after the listed visual checks and continue with the remaining ${summary.canonicalNextActionsCount} queued production action(s), starting with ${summary.canonicalNextActions[0]?.stateId ?? 'the next listed state'}.`
              : objectivelyAcceptanceClean
                ? `This targeted rerender batch is objectively clean and the canonical production queue is empty. Only ${remainingManualAcceptanceSteps.length} manual acceptance step(s) remain above; there is no remaining open rerender work to unlock unless that visual check finds a defect.`
                : 'This targeted rerender batch refreshed the review evidence, but it is not yet acceptance-clean. Use the checklist above to resolve the remaining review blockers before treating this cleanup pass as complete.'
];

await fs.writeFile(reportMdPath, `${mdLines.join('\n')}\n`);

console.log(`Wrote ${relativeFromRoot(reportJsonPath)} and ${relativeFromRoot(reportMdPath)}.`);

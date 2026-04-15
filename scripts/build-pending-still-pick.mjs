import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const reviewPath = path.join(root, 'data', 'generated', 'still-candidate-review.json');
const outputDir = path.join(root, 'data', 'generated');
const pendingJsonPath = path.join(outputDir, 'pending-still-pick.json');
const pendingMdPath = path.join(outputDir, 'pending-still-pick.md');
const pendingHtmlPath = path.join(outputDir, 'pending-still-pick.html');

const readJsonIfExists = async (targetPath) => {
  try {
    return JSON.parse(await fs.readFile(targetPath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
};

const stateArg = process.argv.find((arg) => arg.startsWith('--state='));
const selectedState = stateArg ? stateArg.split('=')[1].trim() : null;

const readJson = async (targetPath) => JSON.parse(await fs.readFile(targetPath, 'utf8'));
const escapeHtml = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const ensureDir = async (targetPath) => {
  await fs.mkdir(targetPath, { recursive: true });
};

const writeTextAtomic = async (targetPath, content) => {
  await ensureDir(path.dirname(targetPath));
  const tempPath = `${targetPath}.tmp`;
  await fs.writeFile(tempPath, content, 'utf8');
  await fs.rename(tempPath, targetPath);
};

const runFfmpeg = async ({ inputPaths, filterComplex, outputPath, errorLabel }) => {
  await ensureDir(path.dirname(outputPath));
  const args = ['-y'];
  for (const inputPath of inputPaths) {
    args.push('-i', inputPath);
  }
  args.push('-filter_complex', filterComplex, outputPath);

  const result = spawnSync('ffmpeg', args, { encoding: 'utf8' });
  if (result.status !== 0) {
    const stderr = (result.stderr || '').trim();
    const stdout = (result.stdout || '').trim();
    throw new Error(stderr || stdout || errorLabel);
  }
};

const buildShortlistBoard = async ({ stateId, shortlist }) => {
  if (!shortlist?.length) {
    return { shortlistBoardPath: null, shortlistBoardFilesystemPath: null, shortlistBoardStatus: 'skipped', shortlistBoardError: null };
  }

  const candidateInputs = shortlist.map((candidate) => candidate.candidateFilesystemPath).filter(Boolean);
  const debrisInputs = shortlist.map((candidate) => candidate.debrisFocusFilesystemPath).filter(Boolean);

  if (candidateInputs.length !== shortlist.length || debrisInputs.length !== shortlist.length) {
    return { shortlistBoardPath: null, shortlistBoardFilesystemPath: null, shortlistBoardStatus: 'missing-inputs', shortlistBoardError: 'Shortlist board requires candidate and debris-focus files for every shortlisted option.' };
  }

  const shortlistBoardPath = path.join('out', `${stateId}-still-regeneration`, `${stateId}-still-regeneration-shortlist-board.png`).replace(/\\/g, '/');
  const shortlistBoardFilesystemPath = path.join(root, shortlistBoardPath.replace(/^[/\\]+/, '').replace(/\//g, path.sep));

  try {
    await runFfmpeg({
      inputPaths: [...candidateInputs, ...debrisInputs],
      filterComplex: [
        `[0:v][1:v][2:v]hstack=inputs=${shortlist.length}[top];`,
        '[3:v]scale=1536:-1[d0];',
        '[4:v]scale=1536:-1[d1];',
        '[5:v]scale=1536:-1[d2];',
        '[d0][d1][d2]hstack=inputs=3[bottom];',
        '[top][bottom]vstack=inputs=2',
      ].join(''),
      outputPath: shortlistBoardFilesystemPath,
      errorLabel: 'ffmpeg shortlist board build failed',
    });

    return { shortlistBoardPath, shortlistBoardFilesystemPath, shortlistBoardStatus: 'generated', shortlistBoardError: null };
  } catch (error) {
    return {
      shortlistBoardPath: null,
      shortlistBoardFilesystemPath: null,
      shortlistBoardStatus: 'failed',
      shortlistBoardError: error instanceof Error ? error.message : String(error),
    };
  }
};

const buildActionNowBoard = async ({ stateId, candidates }) => {
  if (!candidates?.length) {
    return { actionNowBoardPath: null, actionNowBoardFilesystemPath: null, actionNowBoardStatus: 'skipped', actionNowBoardError: null };
  }

  const reviewBoardInputs = candidates.map((candidate) => candidate.reviewBoardFilesystemPath).filter(Boolean);
  if (reviewBoardInputs.length !== candidates.length) {
    return { actionNowBoardPath: null, actionNowBoardFilesystemPath: null, actionNowBoardStatus: 'missing-inputs', actionNowBoardError: 'Action-now board requires single-file review boards for every unresolved shortlist candidate.' };
  }

  const actionNowBoardPath = path.join('out', `${stateId}-still-regeneration`, `${stateId}-still-regeneration-action-now-board.png`).replace(/\\/g, '/');
  const actionNowBoardFilesystemPath = path.join(root, actionNowBoardPath.replace(/^[/\\]+/, '').replace(/\//g, path.sep));
  const stackInputs = reviewBoardInputs.map((_, index) => `[${index}:v]`).join('');

  try {
    await runFfmpeg({
      inputPaths: reviewBoardInputs,
      filterComplex: `${stackInputs}vstack=inputs=${reviewBoardInputs.length}`,
      outputPath: actionNowBoardFilesystemPath,
      errorLabel: 'ffmpeg action-now board build failed',
    });

    return { actionNowBoardPath, actionNowBoardFilesystemPath, actionNowBoardStatus: 'generated', actionNowBoardError: null };
  } catch (error) {
    return {
      actionNowBoardPath: null,
      actionNowBoardFilesystemPath: null,
      actionNowBoardStatus: 'failed',
      actionNowBoardError: error instanceof Error ? error.message : String(error),
    };
  }
};

const defaultStatus = 'No candidate is approved by default. Treat the current batch as blocked until one candidate is explicitly chosen by human review and then survives the follow-up loop rerender acceptance check.';
const shortlistDisclaimer = 'The shortlist is triage order only. It is not a recommendation, endorsement, or approval signal; every shortlisted candidate must still pass the same debris and identity checks as the rest of the batch.';
const rejectRule = 'Reject any candidate whose debris-focus sheet still shows detached rectangular scraps at the left edge, upper-right edge, or lower-right foreground.';
const acceptRule = 'Only promote a candidate if it is truly paper-free in those debris-focus zones and still preserves the approved creature identity, framing, and environment well enough to serve as the cleaned anchor.';
const postPickRule = 'After promotion + rerender, reopen the listed paper-money rerender report and reject the loop again unless both paper-like debris removal and seamless-loop acceptance pass.';
const shortlistActionNowLabel = 'Shortlist still needing action now';
const shortlistCount = 3;
const defaultReviewVerdict = 'unreviewed';
const nextReviewMoveLabel = 'Next review move right now';
const regenerateBatchLabel = 'Regenerate stronger still batch now';
const defaultReviewNote = 'Pending human review. Reject if debris-focus crops still show detached rectangular scraps; only promote if paper-free and identity/framing still match.';
const debrisZoneLabels = {
  left: 'left edge',
  upperRight: 'upper-right edge',
  lowerRight: 'lower-right foreground',
};

const quoteShellArg = (value) => {
  const stringValue = String(value);
  return `'${stringValue.replace(/'/g, "''")}'`;
};

const sanitizeFileToken = (value) => String(value)
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '') || 'item';

const buildStartCommand = (targetPath) => `start "" "${targetPath}"`;

const buildLauncherContent = ({ title, commands }) => [
  '@echo off',
  'setlocal',
  `echo ${title}`,
  ...commands,
  'endlocal',
  '',
].join('\r\n');

const writeLauncher = async ({ fileName, title, commands }) => {
  if (!commands.length) {
    return null;
  }

  const relativePath = path.join('data', 'generated', fileName).replace(/\\/g, '/');
  const filesystemPath = path.join(root, relativePath.replace(/^[/\\]+/, '').replace(/\//g, path.sep));
  await ensureDir(path.dirname(filesystemPath));
  await writeTextAtomic(filesystemPath, buildLauncherContent({ title, commands }));
  return {
    path: relativePath,
    filesystemPath,
    command: buildStartCommand(filesystemPath),
  };
};

const buildReviewCommand = ({ stateId, index, verdict, note }) => {
  const args = [
    'npm run mark:still-review --',
    `--state=${stateId}`,
    `--candidate=${index}`,
    `--verdict=${verdict}`,
  ];
  if (note) {
    args.push(`--note=${quoteShellArg(note)}`);
  }
  return args.join(' ');
};

const toFixedMetric = (value, digits = 4) => (typeof value === 'number' ? value.toFixed(digits) : null);

const buildWatchZones = (metrics) => {
  const zoneSsim = metrics?.debrisZoneSsim;
  if (!zoneSsim) {
    return [];
  }

  return Object.entries(zoneSsim)
    .map(([zoneKey, zoneValue]) => ({
      zoneKey,
      label: debrisZoneLabels[zoneKey] ?? zoneKey,
      ssim: typeof zoneValue === 'number' ? zoneValue : null,
    }))
    .filter((zone) => zone.ssim !== null)
    .sort((a, b) => b.ssim - a.ssim)
    .map((zone, index) => ({
      ...zone,
      rank: index + 1,
      ssimText: toFixedMetric(zone.ssim),
      changeText: toFixedMetric(1 - zone.ssim),
      reviewNote: `${zone.label} still looks ${toFixedMetric(zone.ssim, 3)} similar to the contaminated reference, so inspect that crop carefully for surviving rectangular scraps.`,
    }));
};

const review = await readJson(reviewPath);
const previousPending = await readJsonIfExists(pendingJsonPath);
const previousCandidateReviewMap = new Map(
  (previousPending?.pending ?? []).flatMap((entry) =>
    (entry.candidates ?? [])
      .filter((candidate) => candidate?.fingerprint?.sha256)
      .filter((candidate) => candidate.reviewVerdict !== defaultReviewVerdict || candidate.reviewNote !== defaultReviewNote)
      .map((candidate) => [candidate.fingerprint.sha256, {
        reviewVerdict: candidate.reviewVerdict,
        reviewNote: candidate.reviewNote,
        stateId: entry.stateId,
        candidateIndex: candidate.index,
      }])
  )
);
const entries = review.entries.filter((entry) => !selectedState || entry.stateId === selectedState);

if (!entries.length) {
  console.log(selectedState ? `No still candidate review entries found for ${selectedState}.` : 'No still candidate review entries found.');
  process.exit(0);
}

const pendingEntries = await Promise.all(entries.map(async (entry) => {
  const rankedCandidates = entry.rankedCandidates ?? [];
  const shortlist = rankedCandidates.slice(0, shortlistCount).map((candidate) => {
    const fullCandidate = entry.outputs.find((output) => output.index === candidate.index);
    return {
      ...candidate,
      candidatePath: fullCandidate?.path ?? null,
      candidateFilesystemPath: fullCandidate?.filesystemPath ?? null,
      reviewBoardPath: fullCandidate?.reviewBoardPath ?? null,
      reviewBoardFilesystemPath: fullCandidate?.reviewBoardFilesystemPath ?? null,
      comparisonPath: fullCandidate?.comparisonPath ?? null,
      comparisonFilesystemPath: fullCandidate?.comparisonFilesystemPath ?? null,
      debrisFocusPath: fullCandidate?.debrisFocusComparisonPath ?? fullCandidate?.debrisFocusPath ?? null,
      debrisFocusFilesystemPath: fullCandidate?.debrisFocusComparisonFilesystemPath ?? null,
      diffPath: fullCandidate?.diffComparisonPath ?? null,
      diffFilesystemPath: fullCandidate?.diffComparisonFilesystemPath ?? null,
      promoteCommand: fullCandidate?.promoteCommand ?? null,
      watchZones: buildWatchZones(fullCandidate?.metrics ?? candidate),
    };
  });

  const shortlistBoard = await buildShortlistBoard({ stateId: entry.stateId, shortlist });

  const candidates = entry.outputs.map((output) => {
    const previousReview = output.fingerprint?.sha256
      ? previousCandidateReviewMap.get(output.fingerprint.sha256)
      : null;

    return {
      index: output.index,
      candidatePath: output.path,
      candidateFilesystemPath: output.filesystemPath ?? path.join(root, output.path.replace(/^[/\\]+/, '').replace(/\//g, path.sep)),
      reviewBoardPath: output.reviewBoardPath ?? null,
      reviewBoardFilesystemPath: output.reviewBoardFilesystemPath ?? (output.reviewBoardPath ? path.join(root, output.reviewBoardPath.replace(/^[/\\]+/, '').replace(/\//g, path.sep)) : null),
      fingerprint: output.fingerprint ?? null,
      metrics: output.metrics ?? null,
      metricsError: output.metricsError ?? null,
      watchZones: buildWatchZones(output.metrics),
      comparisonPath: output.comparisonPath,
      comparisonFilesystemPath: output.comparisonFilesystemPath ?? path.join(root, output.comparisonPath.replace(/^[/\\]+/, '').replace(/\//g, path.sep)),
      debrisFocusPath: output.debrisFocusComparisonPath ?? output.debrisFocusPath ?? null,
      debrisFocusFilesystemPath: output.debrisFocusComparisonFilesystemPath ?? (output.debrisFocusComparisonPath ? path.join(root, output.debrisFocusComparisonPath.replace(/^[/\\]+/, '').replace(/\//g, path.sep)) : null),
      diffPath: output.diffComparisonPath ?? null,
      diffFilesystemPath: output.diffComparisonFilesystemPath ?? (output.diffComparisonPath ? path.join(root, output.diffComparisonPath.replace(/^[/\\]+/, '').replace(/\//g, path.sep)) : null),
      promoteCommand: output.promoteCommand,
      rejectCommand: buildReviewCommand({
        stateId: entry.stateId,
        index: output.index,
        verdict: 'reject',
        note: 'Rejected in human review. Debris-focus crops still show detached rectangular scraps or identity/framing drift.',
      }),
      holdCommand: buildReviewCommand({
        stateId: entry.stateId,
        index: output.index,
        verdict: 'hold',
        note: 'Needs more human comparison before approval or rejection.',
      }),
      promoteReviewCommand: buildReviewCommand({
        stateId: entry.stateId,
        index: output.index,
        verdict: 'promote',
        note: 'Chosen in human review as the cleaned still anchor candidate. Promote this still, rerender the loop, and recheck debris + seam acceptance before approving the animation.',
      }),
      reviewVerdict: previousReview?.reviewVerdict ?? defaultReviewVerdict,
      reviewNote: previousReview?.reviewNote ?? defaultReviewNote,
      reviewCarryForward: previousReview
        ? {
            fromStateId: previousReview.stateId,
            fromCandidateIndex: previousReview.candidateIndex,
            fingerprintSha256: output.fingerprint.sha256,
          }
        : null,
    };
  });

  const reviewStatusSummary = candidates.reduce((summary, candidate) => {
    const verdict = candidate.reviewVerdict ?? defaultReviewVerdict;
    summary[verdict] = (summary[verdict] ?? 0) + 1;
    return summary;
  }, { unreviewed: 0, hold: 0, reject: 0, promote: 0 });

  const shortlistWithReview = shortlist.map((candidate) => {
    const fullCandidate = candidates.find((item) => item.index === candidate.index);
    return {
      ...candidate,
      reviewVerdict: fullCandidate?.reviewVerdict ?? defaultReviewVerdict,
      reviewNote: fullCandidate?.reviewNote ?? defaultReviewNote,
    };
  });

  const pendingShortlist = shortlistWithReview.filter((candidate) => candidate.reviewVerdict === 'unreviewed' || candidate.reviewVerdict === 'hold');
  const promotedCandidates = candidates.filter((candidate) => candidate.reviewVerdict === 'promote');
  const shortlistExhaustedWithoutPromotion = shortlistWithReview.length > 0 && pendingShortlist.length === 0 && promotedCandidates.length === 0;
  const regenerateStillCommand = `npm run generate:stills -- --state=${entry.stateId}`;
  const refreshReviewCommand = `npm run review:still-pick -- --state=${entry.stateId}`;

  const actionNowBoard = await buildActionNowBoard({ stateId: entry.stateId, candidates: pendingShortlist });

  return {
    stateId: entry.stateId,
    stateIndex: entry.stateIndex,
    label: entry.label,
    canonicalTarget: entry.canonicalTarget,
    referenceImage: entry.referenceImage ?? null,
    referenceImageFilesystemPath: entry.referenceImageFilesystemPath ?? null,
    referenceFingerprint: entry.referenceFingerprint ?? null,
    overviewPath: entry.overviewPath ?? null,
    overviewFilesystemPath: entry.overviewFilesystemPath ?? null,
    reviewHtml: 'data/generated/still-candidate-review.html',
    reviewMarkdown: 'data/generated/still-candidate-review.md',
    postPickRerenderReport: 'data/generated/paper-money-rerender-report.md',
    postPickRerenderReportFilesystemPath: path.join(root, 'data', 'generated', 'paper-money-rerender-report.md'),
    candidates,
    reviewStatusSummary,
    rankedCandidates,
    shortlist: shortlistWithReview,
    pendingShortlist,
    shortlistBoardPath: shortlistBoard.shortlistBoardPath,
    shortlistBoardFilesystemPath: shortlistBoard.shortlistBoardFilesystemPath,
    shortlistBoardStatus: shortlistBoard.shortlistBoardStatus,
    shortlistBoardError: shortlistBoard.shortlistBoardError,
    actionNowBoardPath: actionNowBoard.actionNowBoardPath,
    actionNowBoardFilesystemPath: actionNowBoard.actionNowBoardFilesystemPath,
    actionNowBoardStatus: actionNowBoard.actionNowBoardStatus,
    actionNowBoardError: actionNowBoard.actionNowBoardError,
    shortlistSummary: shortlistWithReview.length
      ? `Start with shortlist candidates ${shortlistWithReview.map((candidate) => candidate.index).join(', ')} in that order.`
      : 'No ranked shortlist is available for this batch.',
    decisionStatus: shortlistExhaustedWithoutPromotion ? 'shortlist-exhausted-needs-regeneration' : 'pending-human-pick',
    shortlistExhaustedWithoutPromotion,
    regenerateStillCommand,
    refreshReviewCommand,
    nextAction: pendingShortlist.length
      ? `Start with shortlist candidates ${pendingShortlist.map((candidate) => candidate.index).join(', ')} that still need action, reject any option whose debris-focus sheet still shows detached rectangular scraps, then promote exactly one truly paper-free candidate and reopen the rerender report after the loop rerun.`
      : shortlistExhaustedWithoutPromotion
        ? `The shortlist is exhausted with no promoted candidate. Regenerate a stronger still batch from the scrubbed reference via \`${regenerateStillCommand}\`, then rebuild the review surface via \`${refreshReviewCommand}\` before any state-20/b rerender attempt.`
        : shortlistWithReview.length
          ? 'The triaged shortlist is already fully marked. Recheck those recorded shortlist verdicts, then either promote the chosen candidate or continue into the remaining full matrix if the shortlist is exhausted.'
          : 'Use the overview + compare + debris-focus surfaces to choose exactly one truly paper-free candidate, run its listed promote:still command without --dry-run, then reopen the paper-money rerender report to review the refreshed loop acceptance evidence.',
  };
}));

const reviewHtmlFilesystemPath = path.join(root, 'data', 'generated', 'still-candidate-review.html');
const reviewMarkdownFilesystemPath = path.join(root, 'data', 'generated', 'still-candidate-review.md');

const pendingQuickLaunch = pendingEntries.map((entry) => ({
  stateId: entry.stateId,
  label: entry.label,
  pendingHtmlPath: 'data/generated/pending-still-pick.html',
  pendingHtmlFilesystemPath: pendingHtmlPath,
  reviewHtmlPath: entry.reviewHtml,
  reviewHtmlFilesystemPath,
  reviewMarkdownPath: entry.reviewMarkdown,
  reviewMarkdownFilesystemPath,
  referenceImagePath: entry.referenceImage,
  referenceImageFilesystemPath: entry.referenceImageFilesystemPath,
  overviewPath: entry.overviewPath,
  overviewFilesystemPath: entry.overviewFilesystemPath,
  shortlistBoardPath: entry.shortlistBoardPath,
  shortlistBoardFilesystemPath: entry.shortlistBoardFilesystemPath,
  actionNowBoardPath: entry.actionNowBoardPath,
  actionNowBoardFilesystemPath: entry.actionNowBoardFilesystemPath,
  postPickRerenderReport: entry.postPickRerenderReport,
  postPickRerenderReportFilesystemPath: entry.postPickRerenderReportFilesystemPath,
}));

const pendingStartHere = pendingEntries.flatMap((entry) =>
  entry.shortlist.map((candidate) => {
    const fullCandidate = entry.candidates.find((item) => item.index === candidate.index);
    return {
      stateId: entry.stateId,
      label: entry.label,
      shortlistBoardPath: entry.shortlistBoardPath,
      shortlistBoardFilesystemPath: entry.shortlistBoardFilesystemPath,
      index: candidate.index,
      triageRank: candidate.triageRank,
      triageScore: candidate.triageScore,
      candidatePath: candidate.candidatePath,
      candidateFilesystemPath: candidate.candidateFilesystemPath,
      reviewBoardPath: candidate.reviewBoardPath,
      reviewBoardFilesystemPath: candidate.reviewBoardFilesystemPath,
      comparisonPath: candidate.comparisonPath,
      comparisonFilesystemPath: candidate.comparisonFilesystemPath,
      debrisFocusPath: candidate.debrisFocusPath,
      debrisFocusFilesystemPath: candidate.debrisFocusFilesystemPath,
      diffPath: candidate.diffPath,
      diffFilesystemPath: candidate.diffFilesystemPath,
      promoteCommand: candidate.promoteCommand,
      rejectCommand: fullCandidate?.rejectCommand ?? null,
      holdCommand: fullCandidate?.holdCommand ?? null,
      promoteReviewCommand: fullCandidate?.promoteReviewCommand ?? null,
      reviewVerdict: fullCandidate?.reviewVerdict ?? defaultReviewVerdict,
      reviewNote: fullCandidate?.reviewNote ?? defaultReviewNote,
      watchZones: fullCandidate?.watchZones ?? candidate.watchZones ?? [],
    };
  })
);

const pendingActionNow = pendingEntries.flatMap((entry) =>
  entry.pendingShortlist.map((candidate) => {
    const fullCandidate = entry.candidates.find((item) => item.index === candidate.index);
    return {
      stateId: entry.stateId,
      label: entry.label,
      shortlistBoardPath: entry.shortlistBoardPath,
      shortlistBoardFilesystemPath: entry.shortlistBoardFilesystemPath,
      index: candidate.index,
      triageRank: candidate.triageRank,
      triageScore: candidate.triageScore,
      candidatePath: candidate.candidatePath,
      candidateFilesystemPath: candidate.candidateFilesystemPath,
      reviewBoardPath: candidate.reviewBoardPath,
      reviewBoardFilesystemPath: candidate.reviewBoardFilesystemPath,
      comparisonPath: candidate.comparisonPath,
      comparisonFilesystemPath: candidate.comparisonFilesystemPath,
      debrisFocusPath: candidate.debrisFocusPath,
      debrisFocusFilesystemPath: candidate.debrisFocusFilesystemPath,
      diffPath: candidate.diffPath,
      diffFilesystemPath: candidate.diffFilesystemPath,
      promoteCommand: candidate.promoteCommand,
      rejectCommand: fullCandidate?.rejectCommand ?? null,
      holdCommand: fullCandidate?.holdCommand ?? null,
      promoteReviewCommand: fullCandidate?.promoteReviewCommand ?? null,
      reviewVerdict: fullCandidate?.reviewVerdict ?? defaultReviewVerdict,
      reviewNote: fullCandidate?.reviewNote ?? defaultReviewNote,
      watchZones: fullCandidate?.watchZones ?? candidate.watchZones ?? [],
    };
  })
);

const nextReviewMoves = pendingEntries
  .map((entry) => {
    const nextCandidate = entry.pendingShortlist[0] ?? null;
    if (!nextCandidate) {
      return null;
    }

    const fullCandidate = entry.candidates.find((item) => item.index === nextCandidate.index);
    return {
      stateId: entry.stateId,
      label: entry.label,
      index: nextCandidate.index,
      triageRank: nextCandidate.triageRank,
      triageScore: nextCandidate.triageScore,
      reviewVerdict: fullCandidate?.reviewVerdict ?? defaultReviewVerdict,
      reviewNote: fullCandidate?.reviewNote ?? defaultReviewNote,
      candidatePath: nextCandidate.candidatePath,
      candidateFilesystemPath: nextCandidate.candidateFilesystemPath,
      reviewBoardPath: nextCandidate.reviewBoardPath,
      reviewBoardFilesystemPath: nextCandidate.reviewBoardFilesystemPath,
      comparisonPath: nextCandidate.comparisonPath,
      comparisonFilesystemPath: nextCandidate.comparisonFilesystemPath,
      debrisFocusPath: nextCandidate.debrisFocusPath,
      debrisFocusFilesystemPath: nextCandidate.debrisFocusFilesystemPath,
      diffPath: nextCandidate.diffPath,
      diffFilesystemPath: nextCandidate.diffFilesystemPath,
      rejectCommand: fullCandidate?.rejectCommand ?? null,
      holdCommand: fullCandidate?.holdCommand ?? null,
      promoteReviewCommand: fullCandidate?.promoteReviewCommand ?? null,
      promoteCommand: nextCandidate.promoteCommand ?? null,
      watchZones: fullCandidate?.watchZones ?? nextCandidate.watchZones ?? [],
    };
  })
  .filter(Boolean);

const regenerateBatchNow = pendingEntries
  .filter((entry) => entry.shortlistExhaustedWithoutPromotion)
  .map((entry) => ({
    stateId: entry.stateId,
    label: entry.label,
    decisionStatus: entry.decisionStatus,
    nextAction: entry.nextAction,
    regenerateStillCommand: entry.regenerateStillCommand,
    refreshReviewCommand: entry.refreshReviewCommand,
    remainingUnreviewedCandidates: entry.candidates
      .filter((candidate) => candidate.reviewVerdict === 'unreviewed')
      .map((candidate) => ({
        index: candidate.index,
        reviewVerdict: candidate.reviewVerdict,
        reviewNote: candidate.reviewNote,
        candidatePath: candidate.candidatePath,
        candidateFilesystemPath: candidate.candidateFilesystemPath,
        reviewBoardPath: candidate.reviewBoardPath,
        reviewBoardFilesystemPath: candidate.reviewBoardFilesystemPath,
        comparisonPath: candidate.comparisonPath,
        comparisonFilesystemPath: candidate.comparisonFilesystemPath,
        debrisFocusPath: candidate.debrisFocusPath,
        debrisFocusFilesystemPath: candidate.debrisFocusFilesystemPath,
        diffPath: candidate.diffPath,
        diffFilesystemPath: candidate.diffFilesystemPath,
        rejectCommand: candidate.rejectCommand,
        holdCommand: candidate.holdCommand,
        promoteReviewCommand: candidate.promoteReviewCommand,
        watchZones: candidate.watchZones ?? [],
      })),
  }));

const payload = {
  recordedAt: new Date().toISOString(),
  sourceReviewRecordedAt: review.recordedAt,
  stateFilter: selectedState,
  defaultStatus,
  shortlistDisclaimer,
  rejectRule,
  acceptRule,
  postPickRule,
  shortlistCount,
  quickLaunch: pendingQuickLaunch,
  actionNow: pendingActionNow,
  nextReviewMoves,
  regenerateBatchNow,
  startHere: pendingStartHere,
  pending: pendingEntries,
};

for (const entry of payload.quickLaunch) {
  const launcher = await writeLauncher({
    fileName: `${sanitizeFileToken(entry.stateId)}-quick-review.cmd`,
    title: `${entry.stateId} quick review surfaces`,
    commands: [
      buildStartCommand(entry.pendingHtmlFilesystemPath),
      buildStartCommand(entry.reviewHtmlFilesystemPath),
      buildStartCommand(entry.reviewMarkdownFilesystemPath),
      ...(entry.referenceImageFilesystemPath ? [buildStartCommand(entry.referenceImageFilesystemPath)] : []),
      ...(entry.overviewFilesystemPath ? [buildStartCommand(entry.overviewFilesystemPath)] : []),
      ...(entry.shortlistBoardFilesystemPath ? [buildStartCommand(entry.shortlistBoardFilesystemPath)] : []),
      ...(entry.actionNowBoardFilesystemPath ? [buildStartCommand(entry.actionNowBoardFilesystemPath)] : []),
      buildStartCommand(entry.postPickRerenderReportFilesystemPath),
    ],
  });

  entry.quickReviewLauncher = launcher;
}

for (const entry of payload.pending) {
  const actionNowCandidates = payload.actionNow.filter((candidate) => candidate.stateId === entry.stateId);
  const actionNowLauncher = await writeLauncher({
    fileName: `${sanitizeFileToken(entry.stateId)}-action-now-review.cmd`,
    title: `${entry.stateId} shortlist candidates still needing action`,
    commands: [
      ...(entry.shortlistBoardFilesystemPath ? [buildStartCommand(entry.shortlistBoardFilesystemPath)] : []),
      ...(entry.actionNowBoardFilesystemPath ? [buildStartCommand(entry.actionNowBoardFilesystemPath)] : []),
      ...actionNowCandidates.flatMap((candidate) => [
        ...(candidate.reviewBoardFilesystemPath ? [buildStartCommand(candidate.reviewBoardFilesystemPath)] : []),
        ...(candidate.debrisFocusFilesystemPath ? [buildStartCommand(candidate.debrisFocusFilesystemPath)] : []),
        ...(candidate.diffFilesystemPath ? [buildStartCommand(candidate.diffFilesystemPath)] : []),
      ]),
      buildStartCommand(entry.postPickRerenderReportFilesystemPath),
    ],
  });

  entry.actionNowLauncher = actionNowLauncher;

  const quickLaunchEntry = payload.quickLaunch.find((quickLaunch) => quickLaunch.stateId === entry.stateId);
  if (quickLaunchEntry) {
    quickLaunchEntry.actionNowLauncher = actionNowLauncher;
  }
}

for (const candidate of payload.nextReviewMoves) {
  const launcher = await writeLauncher({
    fileName: `${sanitizeFileToken(candidate.stateId)}-next-review-move.cmd`,
    title: `${candidate.stateId} next review move`,
    commands: [
      ...(candidate.candidateFilesystemPath ? [buildStartCommand(candidate.candidateFilesystemPath)] : []),
      ...(candidate.reviewBoardFilesystemPath ? [buildStartCommand(candidate.reviewBoardFilesystemPath)] : []),
      ...(candidate.comparisonFilesystemPath ? [buildStartCommand(candidate.comparisonFilesystemPath)] : []),
      ...(candidate.debrisFocusFilesystemPath ? [buildStartCommand(candidate.debrisFocusFilesystemPath)] : []),
      ...(candidate.diffFilesystemPath ? [buildStartCommand(candidate.diffFilesystemPath)] : []),
    ],
  });

  candidate.nextReviewLauncher = launcher;
}

for (const candidate of [...payload.actionNow, ...payload.startHere]) {
  const launcher = await writeLauncher({
    fileName: `${sanitizeFileToken(candidate.stateId)}-candidate-${String(candidate.index).padStart(2, '0')}-review.cmd`,
    title: `${candidate.stateId} candidate ${candidate.index} review surfaces`,
    commands: [
      ...(candidate.shortlistBoardFilesystemPath ? [buildStartCommand(candidate.shortlistBoardFilesystemPath)] : []),
      ...(candidate.candidateFilesystemPath ? [buildStartCommand(candidate.candidateFilesystemPath)] : []),
      ...(candidate.reviewBoardFilesystemPath ? [buildStartCommand(candidate.reviewBoardFilesystemPath)] : []),
      ...(candidate.comparisonFilesystemPath ? [buildStartCommand(candidate.comparisonFilesystemPath)] : []),
      ...(candidate.debrisFocusFilesystemPath ? [buildStartCommand(candidate.debrisFocusFilesystemPath)] : []),
      ...(candidate.diffFilesystemPath ? [buildStartCommand(candidate.diffFilesystemPath)] : []),
    ],
  });

  candidate.reviewSurfaceLauncher = launcher;
}

for (const entry of payload.regenerateBatchNow) {
  for (const candidate of entry.remainingUnreviewedCandidates ?? []) {
    const launcher = await writeLauncher({
      fileName: `${sanitizeFileToken(entry.stateId)}-candidate-${String(candidate.index).padStart(2, '0')}-fallback-review.cmd`,
      title: `${entry.stateId} candidate ${candidate.index} fallback review surfaces`,
      commands: [
        ...(candidate.candidateFilesystemPath ? [buildStartCommand(candidate.candidateFilesystemPath)] : []),
        ...(candidate.reviewBoardFilesystemPath ? [buildStartCommand(candidate.reviewBoardFilesystemPath)] : []),
        ...(candidate.comparisonFilesystemPath ? [buildStartCommand(candidate.comparisonFilesystemPath)] : []),
        ...(candidate.debrisFocusFilesystemPath ? [buildStartCommand(candidate.debrisFocusFilesystemPath)] : []),
        ...(candidate.diffFilesystemPath ? [buildStartCommand(candidate.diffFilesystemPath)] : []),
      ],
    });

    candidate.reviewSurfaceLauncher = launcher;
  }
}

await writeTextAtomic(pendingJsonPath, `${JSON.stringify(payload, null, 2)}\n`);

const mdLines = [
  '# Pending still pick',
  '',
  'Generated by `node scripts/build-pending-still-pick.mjs`.',
  '',
  `Recorded at: ${payload.recordedAt}`,
  `Source review recorded at: ${payload.sourceReviewRecordedAt}`,
  `State filter: ${selectedState ?? 'all pending still picks'}`,
  '',
  '## Default status',
  '',
  `- ${defaultStatus}`,
  '',
  '## Start here',
  '',
  `- ${shortlistDisclaimer}`,
  '',
  ...(payload.quickLaunch.length
    ? [
        '- Quick-launch the core review surfaces before drilling into individual candidates:',
        ...payload.quickLaunch.flatMap((entry) => [
          `  - ${entry.stateId} · pending-pick HTML: \`${entry.pendingHtmlPath}\``,
          `    - Open pending-pick HTML: \`start "" "${entry.pendingHtmlFilesystemPath}"\``,
          `    - Open detailed review HTML: \`start "" "${entry.reviewHtmlFilesystemPath}"\``,
          `    - Open detailed review Markdown: \`start "" "${entry.reviewMarkdownFilesystemPath}"\``,
          ...(entry.quickReviewLauncher ? [`    - Launch all core review surfaces: \`${entry.quickReviewLauncher.command}\``, `    - Launcher file: \`${entry.quickReviewLauncher.path}\``] : []),
          ...(entry.actionNowLauncher ? [`    - Launch unresolved shortlist bundle: \`${entry.actionNowLauncher.command}\``, `    - Action-now launcher file: \`${entry.actionNowLauncher.path}\``] : []),
          ...(entry.referenceImageFilesystemPath ? [`    - Open contaminated reference still: \`start "" "${entry.referenceImageFilesystemPath}"\``] : []),
          ...(entry.overviewFilesystemPath ? [`    - Open overview: \`start "" "${entry.overviewFilesystemPath}"\``] : []),
          ...(entry.shortlistBoardFilesystemPath ? [`    - Open shortlist board: \`start "" "${entry.shortlistBoardFilesystemPath}"\``] : []),
          ...(entry.actionNowBoardFilesystemPath ? [`    - Open unresolved shortlist review board: \`start "" "${entry.actionNowBoardFilesystemPath}"\``] : []),
          `    - Open post-pick rerender report: \`start "" "${entry.postPickRerenderReportFilesystemPath}"\``,
        ]),
        '',
      ]
    : []),
  ...(payload.nextReviewMoves.length
    ? [
        `- ${nextReviewMoveLabel}:`,
        ...payload.nextReviewMoves.flatMap((candidate) => {
          const watchSummary = candidate.watchZones?.length
            ? ` · watch first: ${candidate.watchZones.slice(0, 2).map((zone) => `${zone.label} (${zone.ssimText})`).join(', ')}`
            : '';
          return [
            `  - ${candidate.stateId} candidate ${candidate.index} (#${candidate.triageRank}, triage \`${candidate.triageScore}\`) · current front-of-queue review \`${candidate.reviewVerdict ?? defaultReviewVerdict}\`${watchSummary}`,
            `    - Review note: ${candidate.reviewNote ?? defaultReviewNote}`,
            ...(candidate.candidateFilesystemPath ? [`    - Open candidate: \`start "" "${candidate.candidateFilesystemPath}"\``] : []),
            ...(candidate.reviewBoardFilesystemPath ? [`    - Open single-file review board: \`start "" "${candidate.reviewBoardFilesystemPath}"\``] : []),
            ...(candidate.comparisonFilesystemPath ? [`    - Open compare: \`start "" "${candidate.comparisonFilesystemPath}"\``] : []),
            ...(candidate.debrisFocusFilesystemPath ? [`    - Open debris-focus: \`start "" "${candidate.debrisFocusFilesystemPath}"\``] : []),
            ...(candidate.diffFilesystemPath ? [`    - Open diff: \`start "" "${candidate.diffFilesystemPath}"\``] : []),
            ...(candidate.nextReviewLauncher ? [`    - Launch front-of-queue review bundle: \`${candidate.nextReviewLauncher.command}\``, `    - Launcher file: \`${candidate.nextReviewLauncher.path}\``] : []),
            ...(candidate.rejectCommand ? [`    - If scraps remain, mark reject: \`${candidate.rejectCommand}\``] : []),
            ...(candidate.holdCommand ? [`    - If undecided after comparison, mark hold: \`${candidate.holdCommand}\``] : []),
            ...(candidate.promoteReviewCommand ? [`    - If truly paper-free, mark chosen-for-promotion: \`${candidate.promoteReviewCommand}\``] : []),
          ];
        }),
        '',
      ]
    : []),
  ...(payload.regenerateBatchNow.length
    ? [
        `- ${regenerateBatchLabel}:`,
        ...payload.regenerateBatchNow.flatMap((entry) => [
          `  - ${entry.stateId} · ${entry.label} · status \`${entry.decisionStatus}\``,
          `    - ${entry.nextAction}`,
          ...(entry.remainingUnreviewedCandidates?.length
            ? [
                `    - Remaining unreviewed fallback candidates before another regeneration: ${entry.remainingUnreviewedCandidates.map((candidate) => `candidate ${candidate.index}`).join(', ')}`,
                ...entry.remainingUnreviewedCandidates.flatMap((candidate) => {
                  const watchSummary = candidate.watchZones?.length
                    ? ` · watch first: ${candidate.watchZones.slice(0, 2).map((zone) => `${zone.label} (${zone.ssimText})`).join(', ')}`
                    : '';
                  return [
                    `      - Candidate ${candidate.index} · review \`${candidate.reviewVerdict}\`${watchSummary}`,
                    `        - Review note: ${candidate.reviewNote ?? defaultReviewNote}`,
                    ...(candidate.candidateFilesystemPath ? [`        - Open candidate: \`start "" "${candidate.candidateFilesystemPath}"\``] : []),
                    ...(candidate.reviewBoardFilesystemPath ? [`        - Open single-file review board: \`start "" "${candidate.reviewBoardFilesystemPath}"\``] : []),
                    ...(candidate.comparisonFilesystemPath ? [`        - Open compare: \`start "" "${candidate.comparisonFilesystemPath}"\``] : []),
                    ...(candidate.debrisFocusFilesystemPath ? [`        - Open debris-focus: \`start "" "${candidate.debrisFocusFilesystemPath}"\``] : []),
                    ...(candidate.diffFilesystemPath ? [`        - Open diff: \`start "" "${candidate.diffFilesystemPath}"\``] : []),
                    ...(candidate.reviewSurfaceLauncher ? [`        - Launch fallback review bundle: \`${candidate.reviewSurfaceLauncher.command}\``, `        - Launcher file: \`${candidate.reviewSurfaceLauncher.path}\``] : []),
                    ...(candidate.rejectCommand ? [`        - Mark reject: \`${candidate.rejectCommand}\``] : []),
                    ...(candidate.holdCommand ? [`        - Mark hold: \`${candidate.holdCommand}\``] : []),
                    ...(candidate.promoteReviewCommand ? [`        - Mark chosen-for-promotion: \`${candidate.promoteReviewCommand}\``] : []),
                  ];
                }),
              ]
            : []),
          `    - Regenerate still batch: \`${entry.regenerateStillCommand}\``,
          `    - Refresh pending-pick artifact: \`${entry.refreshReviewCommand}\``,
        ]),
        '',
      ]
    : []),
  ...(payload.actionNow.length
    ? [
        `- ${shortlistActionNowLabel}:`,
        ...payload.actionNow.flatMap((candidate) => {
          const watchSummary = candidate.watchZones?.length
            ? ` · watch first: ${candidate.watchZones.slice(0, 2).map((zone) => `${zone.label} (${zone.ssimText})`).join(', ')}`
            : '';
          return [
            `  - ${candidate.stateId} candidate ${candidate.index} (#${candidate.triageRank}, triage \`${candidate.triageScore}\`) · review \`${candidate.reviewVerdict ?? defaultReviewVerdict}\`${watchSummary}`,
            `    - Review note: ${candidate.reviewNote ?? defaultReviewNote}`,
            ...(candidate.shortlistBoardFilesystemPath ? [`    - Open shortlist board: \`start "" "${candidate.shortlistBoardFilesystemPath}"\``] : []),
            ...(candidate.candidateFilesystemPath ? [`    - Open candidate: \`start "" "${candidate.candidateFilesystemPath}"\``] : []),
            ...(candidate.reviewBoardFilesystemPath ? [`    - Open single-file review board: \`start "" "${candidate.reviewBoardFilesystemPath}"\``] : []),
            ...(candidate.comparisonFilesystemPath ? [`    - Open compare: \`start "" "${candidate.comparisonFilesystemPath}"\``] : []),
            ...(candidate.debrisFocusFilesystemPath ? [`    - Open debris-focus: \`start "" "${candidate.debrisFocusFilesystemPath}"\``] : []),
            ...(candidate.diffFilesystemPath ? [`    - Open diff: \`start "" "${candidate.diffFilesystemPath}"\``] : []),
            ...(candidate.reviewSurfaceLauncher ? [`    - Launch all candidate review surfaces: \`${candidate.reviewSurfaceLauncher.command}\``, `    - Launcher file: \`${candidate.reviewSurfaceLauncher.path}\``] : []),
            ...(candidate.rejectCommand ? [`    - Mark reject: \`${candidate.rejectCommand}\``] : []),
            ...(candidate.holdCommand ? [`    - Mark hold: \`${candidate.holdCommand}\``] : []),
            ...(candidate.promoteReviewCommand ? [`    - Mark chosen-for-promotion: \`${candidate.promoteReviewCommand}\``] : []),
          ];
        }),
        '',
      ]
    : []),
  ...(payload.startHere.length
    ? [
        '- Review the shortlist candidates in this order before scanning the full matrix:',
        ...Array.from(new Set(payload.startHere.map((candidate) => candidate.shortlistBoardPath).filter(Boolean))).flatMap((shortlistBoardPath) => {
          const shortlistBoardEntry = payload.startHere.find((candidate) => candidate.shortlistBoardPath === shortlistBoardPath);
          return [
            `- Shared shortlist board: \`${shortlistBoardPath}\``,
            ...(shortlistBoardEntry?.shortlistBoardFilesystemPath ? [`- Open shortlist board: \`start "" "${shortlistBoardEntry.shortlistBoardFilesystemPath}"\``] : []),
          ];
        }),
        ...payload.startHere.flatMap((candidate) => {
          const pendingEntry = payload.pending.find((entry) => entry.stateId === candidate.stateId);
          const shortlistCandidate = pendingEntry?.shortlist.find((item) => item.index === candidate.index);
          const watchSummary = shortlistCandidate?.watchZones?.length
            ? ` · watch first: ${shortlistCandidate.watchZones.slice(0, 2).map((zone) => `${zone.label} (${zone.ssimText})`).join(', ')}`
            : '';
          return [
            `  - ${candidate.stateId} candidate ${candidate.index} (#${candidate.triageRank}, triage \`${candidate.triageScore}\`) · review \`${candidate.reviewVerdict ?? defaultReviewVerdict}\` · compare \`${candidate.comparisonPath}\` · debris-focus \`${candidate.debrisFocusPath ?? '—'}\`${watchSummary} · promote \`${candidate.promoteCommand ?? '—'}\``,
            `    - Review note: ${candidate.reviewNote ?? defaultReviewNote}`,
            ...(candidate.candidateFilesystemPath ? [`    - Open candidate: \`start "" "${candidate.candidateFilesystemPath}"\``] : []),
            ...(candidate.reviewBoardFilesystemPath ? [`    - Open single-file review board: \`start "" "${candidate.reviewBoardFilesystemPath}"\``] : []),
            ...(candidate.comparisonFilesystemPath ? [`    - Open compare: \`start "" "${candidate.comparisonFilesystemPath}"\``] : []),
            ...(candidate.debrisFocusFilesystemPath ? [`    - Open debris-focus: \`start "" "${candidate.debrisFocusFilesystemPath}"\``] : []),
            ...(candidate.diffFilesystemPath ? [`    - Open diff: \`start "" "${candidate.diffFilesystemPath}"\``] : []),
            ...(candidate.reviewSurfaceLauncher ? [`    - Launch all candidate review surfaces: \`${candidate.reviewSurfaceLauncher.command}\``, `    - Launcher file: \`${candidate.reviewSurfaceLauncher.path}\``] : []),
            ...(candidate.rejectCommand ? [`    - Mark reject: \`${candidate.rejectCommand}\``] : []),
            ...(candidate.holdCommand ? [`    - Mark hold: \`${candidate.holdCommand}\``] : []),
            ...(candidate.promoteReviewCommand ? [`    - Mark chosen-for-promotion: \`${candidate.promoteReviewCommand}\``] : []),
          ];
        }),
        '',
      ]
    : [
        '- No shortlist available; use the full candidate matrix below.',
        '',
      ]),
  '## Acceptance gate',
  '',
  `- ${rejectRule}`,
  `- ${acceptRule}`,
  `- ${postPickRule}`,
  '',
  ...payload.pending.flatMap((entry) => [
    `## ${entry.stateId} · ${entry.label}`,
    '',
    `- Decision status: \`${entry.decisionStatus}\``,
    `- Review status summary: unreviewed \`${entry.reviewStatusSummary.unreviewed ?? 0}\` · hold \`${entry.reviewStatusSummary.hold ?? 0}\` · reject \`${entry.reviewStatusSummary.reject ?? 0}\` · promote \`${entry.reviewStatusSummary.promote ?? 0}\``,
    `- Canonical target: \`${entry.canonicalTarget}\``,
    ...(entry.referenceImage ? [`- Contaminated reference still: \`${entry.referenceImage}\``] : []),
    ...(entry.referenceFingerprint ? [`- Reference fingerprint: sha256 \`${entry.referenceFingerprint.sha256}\` · bytes \`${entry.referenceFingerprint.bytes}\` · modified \`${entry.referenceFingerprint.modifiedAt}\``] : []),
    ...(entry.overviewPath ? [`- Overview image: \`${entry.overviewPath}\``] : []),
    ...(entry.overviewFilesystemPath ? [`- Open overview: \`start "" "${entry.overviewFilesystemPath}"\``] : []),
    `- Review HTML: \`${entry.reviewHtml}\``,
    `- Review Markdown: \`${entry.reviewMarkdown}\``,
    `- Post-pick rerender report: \`${entry.postPickRerenderReport}\``,
    `- Open post-pick rerender report: \`start "" "${entry.postPickRerenderReportFilesystemPath}"\``,
    ...(entry.rankedCandidates.length
      ? [
          '- Automated triage ranking (higher score = stronger whole-image retention plus more change in the known debris zones):',
          ...entry.rankedCandidates.map((candidate) => `  ${candidate.triageRank}. candidate ${candidate.index} · triage \`${candidate.triageScore}\` · full-image SSIM \`${candidate.fullImageSsim}\` · debris-zone change avg \`${candidate.debrisZoneChangeAverage}\``),
        ]
      : ['- Automated triage ranking: unavailable (metrics failed for all candidates).']),
    ...(entry.shortlist.length
      ? [
          `- Priority shortlist: start with candidates ${entry.shortlist.map((candidate) => candidate.index).join(', ')} before reviewing the rest.`,
          `- Shortlist still needing action: ${entry.pendingShortlist.length ? entry.pendingShortlist.map((candidate) => `candidate ${candidate.index} (${candidate.reviewVerdict})`).join(', ') : 'none — shortlist verdicts are already recorded.'}`,
          ...(entry.shortlistExhaustedWithoutPromotion ? [`- Shortlist exhausted without promotion: \`yes\``, `- Regenerate still batch: \`${entry.regenerateStillCommand}\``, `- Refresh pending-pick artifact after regeneration: \`${entry.refreshReviewCommand}\``] : []),
          ...(entry.shortlistBoardPath ? [`- Shortlist board: \`${entry.shortlistBoardPath}\``] : []),
          ...(entry.shortlistBoardFilesystemPath ? [`- Open shortlist board: \`start "" "${entry.shortlistBoardFilesystemPath}"\``] : []),
          ...(entry.shortlistBoardError ? [`- Shortlist board status: \`${entry.shortlistBoardStatus}\` · ${entry.shortlistBoardError}`] : []),
          ...entry.shortlist.map((candidate) => `  - Candidate ${candidate.index} (#${candidate.triageRank}) · triage \`${candidate.triageScore}\` · compare \`${candidate.comparisonPath}\` · debris-focus \`${candidate.debrisFocusPath}\` · promote \`${candidate.promoteCommand}\``),
        ]
      : ['- Priority shortlist: unavailable (no ranked candidates recorded).']),
    ...(entry.shortlistExhaustedWithoutPromotion && entry.candidates.some((candidate) => candidate.reviewVerdict === 'unreviewed')
      ? [
          `- Remaining unreviewed fallback candidates before another regeneration: ${entry.candidates.filter((candidate) => candidate.reviewVerdict === 'unreviewed').map((candidate) => `candidate ${candidate.index}`).join(', ')}`,
        ]
      : []),
    ...(entry.shortlist.length
      ? [
          '',
          '### Shortlist review cards',
          '',
          ...entry.shortlist.flatMap((candidate) => {
            const fullCandidate = entry.candidates.find((item) => item.index === candidate.index);
            return [
              `#### Candidate ${candidate.index} · rank #${candidate.triageRank}`,
              '',
              `- Candidate image: \`${candidate.candidatePath ?? '—'}\``,
              ...(fullCandidate?.fingerprint ? [`- Fingerprint: sha256 \`${fullCandidate.fingerprint.sha256}\` · bytes \`${fullCandidate.fingerprint.bytes}\` · modified \`${fullCandidate.fingerprint.modifiedAt}\``] : []),
              `- Review verdict: \`${fullCandidate?.reviewVerdict ?? defaultReviewVerdict}\``,
              `- Review note: ${fullCandidate?.reviewNote ?? defaultReviewNote}`,
              `- Single-file review board: \`${candidate.reviewBoardPath ?? '—'}\``,
              `- Compare image: \`${candidate.comparisonPath ?? '—'}\``,
              `- Debris-focus image: \`${candidate.debrisFocusPath ?? '—'}\``,
              `- Diff image: \`${candidate.diffPath ?? '—'}\``,
              ...(candidate.watchZones?.length
                ? [
                    '- Watch zones (highest similarity to the contaminated reference first):',
                    ...candidate.watchZones.map((zone) => `  - ${zone.label} · SSIM \`${zone.ssimText}\` · change \`${zone.changeText}\` · ${zone.reviewNote}`),
                  ]
                : []),
              `- Mark reject: \`${fullCandidate?.rejectCommand ?? '—'}\``,
              `- Mark hold: \`${fullCandidate?.holdCommand ?? '—'}\``,
              `- Mark chosen-for-promotion: \`${fullCandidate?.promoteReviewCommand ?? '—'}\``,
              `- Promote command: \`${candidate.promoteCommand ?? '—'}\``,
              ...(candidate.candidateFilesystemPath ? [`- Open candidate: \`start "" "${candidate.candidateFilesystemPath}"\``] : []),
              ...(candidate.reviewBoardFilesystemPath ? [`- Open single-file review board: \`start "" "${candidate.reviewBoardFilesystemPath}"\``] : []),
              ...(candidate.comparisonFilesystemPath ? [`- Open compare: \`start "" "${candidate.comparisonFilesystemPath}"\``] : []),
              ...(candidate.debrisFocusFilesystemPath ? [`- Open debris-focus: \`start "" "${candidate.debrisFocusFilesystemPath}"\``] : []),
              ...(candidate.diffFilesystemPath ? [`- Open diff: \`start "" "${candidate.diffFilesystemPath}"\``] : []),
              ...(candidate.reviewSurfaceLauncher ? [`- Launch all candidate review surfaces: \`${candidate.reviewSurfaceLauncher.command}\``, `- Launcher file: \`${candidate.reviewSurfaceLauncher.path}\``] : []),
              '',
            ];
          }),
        ]
      : []),
    `- Next action: ${entry.nextAction}`,
    '',
    '| Candidate | Candidate image | Fingerprint | Review status | Metrics | Watch first | Review board | Compare image | Debris-focus image | Diff image | Review commands | Promote command |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...entry.candidates.map((candidate) => `| ${candidate.index} | \`${candidate.candidatePath}\` | ${candidate.fingerprint ? `sha256 \`${candidate.fingerprint.sha256}\`<br>bytes \`${candidate.fingerprint.bytes}\`<br>modified \`${candidate.fingerprint.modifiedAt}\`` : '—'} | verdict \`${candidate.reviewVerdict ?? defaultReviewVerdict}\`<br>${(candidate.reviewNote ?? defaultReviewNote).replace(/\|/g, '\\|')} | ${candidate.metrics ? `full SSIM \`${candidate.metrics.fullImageSsim}\`<br>left \`${candidate.metrics.debrisZoneSsim.left}\`<br>upper-right \`${candidate.metrics.debrisZoneSsim.upperRight}\`<br>lower-right \`${candidate.metrics.debrisZoneSsim.lowerRight}\`<br>debris change avg \`${candidate.metrics.debrisZoneChangeAverage}\`<br>triage \`${candidate.metrics.triageScore}\`` : `metrics failed: ${candidate.metricsError ?? 'unknown error'}`} | ${candidate.watchZones?.length ? candidate.watchZones.slice(0, 2).map((zone) => `${zone.label} \`${zone.ssimText}\``).join('<br>') : '—'} | ${candidate.reviewBoardPath ? `\`${candidate.reviewBoardPath}\`` : '—'} | \`${candidate.comparisonPath}\` | ${candidate.debrisFocusPath ? `\`${candidate.debrisFocusPath}\`` : '—'} | ${candidate.diffPath ? `\`${candidate.diffPath}\`` : '—'} | reject \`${candidate.rejectCommand}\`<br>hold \`${candidate.holdCommand}\`<br>choose \`${candidate.promoteReviewCommand}\` | \`${candidate.promoteCommand}\` |`),
    '',
  ]),
];

await writeTextAtomic(pendingMdPath, `${mdLines.join('\n')}\n`);

const htmlLines = [
  '<!doctype html>',
  '<html lang="en">',
  '<head>',
  '  <meta charset="utf-8" />',
  '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
  '  <title>Pending still pick</title>',
  '  <style>',
  '    :root { color-scheme: dark; }',
  '    body { font-family: Inter, Segoe UI, Arial, sans-serif; margin: 24px; background: #0b1020; color: #e8ecf3; }',
  '    h1, h2, h3, p { margin: 0 0 12px; }',
  '    .meta { color: #aab6cc; margin-bottom: 24px; }',
  '    .entry { background: #121a2b; border: 1px solid #25324a; border-radius: 14px; padding: 18px; margin-bottom: 24px; }',
  '    .gate { background: #2a1d13; border: 1px solid #7a4a2a; border-radius: 14px; padding: 18px; margin-bottom: 24px; }',
  '    .status { background: #291626; border: 1px solid #7c3658; border-radius: 14px; padding: 18px; margin-bottom: 24px; }',
  '    .start-here { background: #132235; border: 1px solid #2f5f94; border-radius: 14px; padding: 18px; margin-bottom: 24px; }',
  '    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin-top: 16px; }',
  '    .shortlist-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 18px; margin: 18px 0 22px; }',
  '    .shortlist-card { background: #18233a; border: 1px solid #35507d; border-radius: 14px; padding: 16px; }',
  '    .shortlist-card h4 { margin: 0 0 10px; }',
  '    figure { margin: 0; background: #0f1727; border: 1px solid #2d3b57; border-radius: 12px; padding: 12px; }',
  '    img { display: block; width: 100%; height: auto; border-radius: 8px; background: #05070d; }',
  '    figcaption { margin-top: 10px; color: #cdd7e8; font-size: 13px; }',
  '    code { color: #8ee6ff; word-break: break-word; }',
  '    .command { margin-top: 8px; padding: 10px 12px; border-radius: 10px; background: #0b1322; border: 1px solid #2d3b57; }',
  '    ul { color: #cdd7e8; }',
  '  </style>',
  '</head>',
  '<body>',
  '  <h1>Pending still pick</h1>',
  `  <p class="meta">Recorded at ${escapeHtml(payload.recordedAt)} · Source review recorded at ${escapeHtml(payload.sourceReviewRecordedAt)} · State filter: ${escapeHtml(selectedState ?? 'all pending still picks')}</p>`,
  '  <section class="status">',
  '    <h2>Default status</h2>',
  `    <p>${escapeHtml(defaultStatus)}</p>`,
  '  </section>',
  '  <section class="start-here">',
  '    <h2>Start here</h2>',
  `    <p><strong>Important:</strong> ${escapeHtml(shortlistDisclaimer)}</p>`,
  ...(payload.quickLaunch.length
    ? [
        '    <p><strong>Quick launch:</strong> open the core review surfaces before drilling into individual candidates.</p>',
        '    <ul>',
        ...payload.quickLaunch.flatMap((entry) => [
          `      <li>${escapeHtml(entry.stateId)} · pending-pick HTML <code>${escapeHtml(entry.pendingHtmlPath)}</code></li>`,
          `      <div class="command"><strong>Open pending-pick HTML:</strong><br><code>${escapeHtml(`start "" "${entry.pendingHtmlFilesystemPath}"`)}</code></div>`,
          `      <div class="command"><strong>Open detailed review HTML:</strong><br><code>${escapeHtml(`start "" "${entry.reviewHtmlFilesystemPath}"`)}</code></div>`,
          `      <div class="command"><strong>Open detailed review Markdown:</strong><br><code>${escapeHtml(`start "" "${entry.reviewMarkdownFilesystemPath}"`)}</code></div>`,
          ...(entry.quickReviewLauncher ? [`      <div class="command"><strong>Launch all core review surfaces:</strong><br><code>${escapeHtml(entry.quickReviewLauncher.command)}</code><br>Launcher file: <code>${escapeHtml(entry.quickReviewLauncher.path)}</code></div>`] : []),
          ...(entry.actionNowLauncher ? [`      <div class="command"><strong>Launch unresolved shortlist bundle:</strong><br><code>${escapeHtml(entry.actionNowLauncher.command)}</code><br>Launcher file: <code>${escapeHtml(entry.actionNowLauncher.path)}</code></div>`] : []),
          ...(entry.referenceImageFilesystemPath ? [`      <div class="command"><strong>Open contaminated reference still:</strong><br><code>${escapeHtml(`start "" "${entry.referenceImageFilesystemPath}"`)}</code></div>`] : []),
          ...(entry.overviewFilesystemPath ? [`      <div class="command"><strong>Open overview:</strong><br><code>${escapeHtml(`start "" "${entry.overviewFilesystemPath}"`)}</code></div>`] : []),
          ...(entry.shortlistBoardFilesystemPath ? [`      <div class="command"><strong>Open shortlist board:</strong><br><code>${escapeHtml(`start "" "${entry.shortlistBoardFilesystemPath}"`)}</code></div>`] : []),
          ...(entry.actionNowBoardFilesystemPath ? [`      <div class="command"><strong>Open unresolved shortlist review board:</strong><br><code>${escapeHtml(`start "" "${entry.actionNowBoardFilesystemPath}"`)}</code></div>`] : []),
          `      <div class="command"><strong>Open post-pick rerender report:</strong><br><code>${escapeHtml(`start "" "${entry.postPickRerenderReportFilesystemPath}"`)}</code></div>`,
        ]),
        '    </ul>',
      ]
    : []),
  ...(payload.nextReviewMoves.length
    ? [
        `    <p><strong>${escapeHtml(nextReviewMoveLabel)}:</strong> resolve the current front-of-queue shortlist item before scanning the rest.</p>`,
        '    <ul>',
        ...payload.nextReviewMoves.flatMap((candidate) => {
          const watchSummary = candidate.watchZones?.length
            ? ` · watch first ${candidate.watchZones.slice(0, 2).map((zone) => `${zone.label} (${zone.ssimText})`).join(', ')}`
            : '';
          return [
            `      <li>${escapeHtml(candidate.stateId)} candidate <code>${escapeHtml(candidate.index)}</code> (#${escapeHtml(candidate.triageRank)}, triage <code>${escapeHtml(candidate.triageScore)}</code>) · current front-of-queue review <code>${escapeHtml(candidate.reviewVerdict ?? defaultReviewVerdict)}</code>${escapeHtml(watchSummary)}<br>Review note: ${escapeHtml(candidate.reviewNote ?? defaultReviewNote)}</li>`,
            ...(candidate.candidateFilesystemPath ? [`      <div class="command"><strong>Open candidate:</strong><br><code>${escapeHtml(`start "" "${candidate.candidateFilesystemPath}"`)}</code></div>`] : []),
            ...(candidate.reviewBoardFilesystemPath ? [`      <div class="command"><strong>Open single-file review board:</strong><br><code>${escapeHtml(`start "" "${candidate.reviewBoardFilesystemPath}"`)}</code></div>`] : []),
            ...(candidate.comparisonFilesystemPath ? [`      <div class="command"><strong>Open compare:</strong><br><code>${escapeHtml(`start "" "${candidate.comparisonFilesystemPath}"`)}</code></div>`] : []),
            ...(candidate.debrisFocusFilesystemPath ? [`      <div class="command"><strong>Open debris focus:</strong><br><code>${escapeHtml(`start "" "${candidate.debrisFocusFilesystemPath}"`)}</code></div>`] : []),
            ...(candidate.diffFilesystemPath ? [`      <div class="command"><strong>Open diff:</strong><br><code>${escapeHtml(`start "" "${candidate.diffFilesystemPath}"`)}</code></div>`] : []),
            ...(candidate.nextReviewLauncher ? [`      <div class="command"><strong>Launch front-of-queue review bundle:</strong><br><code>${escapeHtml(candidate.nextReviewLauncher.command)}</code><br>Launcher file: <code>${escapeHtml(candidate.nextReviewLauncher.path)}</code></div>`] : []),
            ...(candidate.rejectCommand ? [`      <div class="command"><strong>If scraps remain, mark reject:</strong><br><code>${escapeHtml(candidate.rejectCommand)}</code></div>`] : []),
            ...(candidate.holdCommand ? [`      <div class="command"><strong>If undecided after comparison, mark hold:</strong><br><code>${escapeHtml(candidate.holdCommand)}</code></div>`] : []),
            ...(candidate.promoteReviewCommand ? [`      <div class="command"><strong>If truly paper-free, mark chosen-for-promotion:</strong><br><code>${escapeHtml(candidate.promoteReviewCommand)}</code></div>`] : []),
          ];
        }),
        '    </ul>',
      ]
    : []),
  ...(payload.regenerateBatchNow.length
    ? [
        `    <p><strong>${escapeHtml(regenerateBatchLabel)}:</strong></p>`,
        '    <ul>',
        ...payload.regenerateBatchNow.flatMap((entry) => [
          `      <li>${escapeHtml(entry.stateId)} · ${escapeHtml(entry.label)} · status <code>${escapeHtml(entry.decisionStatus)}</code><br>${escapeHtml(entry.nextAction)}${entry.remainingUnreviewedCandidates?.length ? `<br>Remaining unreviewed fallback candidates before another regeneration: ${entry.remainingUnreviewedCandidates.map((candidate) => `candidate <code>${escapeHtml(candidate.index)}</code>`).join(' · ')}` : ''}<br>Regenerate still batch: <code>${escapeHtml(entry.regenerateStillCommand)}</code><br>Refresh pending-pick artifact: <code>${escapeHtml(entry.refreshReviewCommand)}</code></li>`,
          ...(entry.remainingUnreviewedCandidates?.length
            ? entry.remainingUnreviewedCandidates.flatMap((candidate) => {
                const watchSummary = candidate.watchZones?.length
                  ? ` · watch first ${candidate.watchZones.slice(0, 2).map((zone) => `${zone.label} (${zone.ssimText})`).join(', ')}`
                  : '';
                return [
                  `      <div class="command"><strong>Fallback candidate ${escapeHtml(candidate.index)}:</strong><br>review <code>${escapeHtml(candidate.reviewVerdict)}</code>${escapeHtml(watchSummary)}<br>Review note: ${escapeHtml(candidate.reviewNote ?? defaultReviewNote)}</div>`,
                  ...(candidate.candidateFilesystemPath ? [`      <div class="command"><strong>Open candidate:</strong><br><code>${escapeHtml(`start "" "${candidate.candidateFilesystemPath}"`)}</code></div>`] : []),
                  ...(candidate.reviewBoardFilesystemPath ? [`      <div class="command"><strong>Open single-file review board:</strong><br><code>${escapeHtml(`start "" "${candidate.reviewBoardFilesystemPath}"`)}</code></div>`] : []),
                  ...(candidate.comparisonFilesystemPath ? [`      <div class="command"><strong>Open compare:</strong><br><code>${escapeHtml(`start "" "${candidate.comparisonFilesystemPath}"`)}</code></div>`] : []),
                  ...(candidate.debrisFocusFilesystemPath ? [`      <div class="command"><strong>Open debris focus:</strong><br><code>${escapeHtml(`start "" "${candidate.debrisFocusFilesystemPath}"`)}</code></div>`] : []),
                  ...(candidate.diffFilesystemPath ? [`      <div class="command"><strong>Open diff:</strong><br><code>${escapeHtml(`start "" "${candidate.diffFilesystemPath}"`)}</code></div>`] : []),
                  ...(candidate.reviewSurfaceLauncher ? [`      <div class="command"><strong>Launch fallback review bundle:</strong><br><code>${escapeHtml(candidate.reviewSurfaceLauncher.command)}</code><br>Launcher file: <code>${escapeHtml(candidate.reviewSurfaceLauncher.path)}</code></div>`] : []),
                  ...(candidate.rejectCommand ? [`      <div class="command"><strong>Mark reject:</strong><br><code>${escapeHtml(candidate.rejectCommand)}</code></div>`] : []),
                  ...(candidate.holdCommand ? [`      <div class="command"><strong>Mark hold:</strong><br><code>${escapeHtml(candidate.holdCommand)}</code></div>`] : []),
                  ...(candidate.promoteReviewCommand ? [`      <div class="command"><strong>Mark chosen-for-promotion:</strong><br><code>${escapeHtml(candidate.promoteReviewCommand)}</code></div>`] : []),
                ];
              })
            : []),
        ]),
        '    </ul>',
      ]
    : []),
  ...(payload.startHere.length
    ? [
        '    <p>Review the shortlist candidates in this order before scanning the full matrix:</p>',
        ...Array.from(new Set(payload.startHere.map((candidate) => candidate.shortlistBoardPath).filter(Boolean))).flatMap((shortlistBoardPath) => {
          const shortlistBoardEntry = payload.startHere.find((candidate) => candidate.shortlistBoardPath === shortlistBoardPath);
          return [
            `    <p><strong>Shared shortlist board:</strong> <code>${escapeHtml(shortlistBoardPath)}</code></p>`,
            ...(shortlistBoardEntry?.shortlistBoardFilesystemPath ? [`    <div class="command"><strong>Open shortlist board:</strong><br><code>${escapeHtml(`start "" "${shortlistBoardEntry.shortlistBoardFilesystemPath}"`)}</code></div>`] : []),
          ];
        }),
        '    <ul>',
        ...payload.startHere.flatMap((candidate) => {
          const pendingEntry = payload.pending.find((entry) => entry.stateId === candidate.stateId);
          const shortlistCandidate = pendingEntry?.shortlist.find((item) => item.index === candidate.index);
          const watchSummary = shortlistCandidate?.watchZones?.length
            ? ` · watch first ${shortlistCandidate.watchZones.slice(0, 2).map((zone) => `${zone.label} (${zone.ssimText})`).join(', ')}`
            : '';
          return [
            `      <li>${escapeHtml(candidate.stateId)} candidate <code>${escapeHtml(candidate.index)}</code> (#${escapeHtml(candidate.triageRank)}, triage <code>${escapeHtml(candidate.triageScore)}</code>) · review <code>${escapeHtml(candidate.reviewVerdict ?? defaultReviewVerdict)}</code> · compare <code>${escapeHtml(candidate.comparisonPath ?? 'n/a')}</code> · debris-focus <code>${escapeHtml(candidate.debrisFocusPath ?? 'n/a')}</code>${escapeHtml(watchSummary)} · promote <code>${escapeHtml(candidate.promoteCommand ?? 'n/a')}</code><br>Review note: ${escapeHtml(candidate.reviewNote ?? defaultReviewNote)}</li>`,
            ...(candidate.candidateFilesystemPath ? [`      <div class="command"><strong>Open candidate:</strong><br><code>${escapeHtml(`start "" "${candidate.candidateFilesystemPath}"`)}</code></div>`] : []),
            ...(candidate.reviewBoardFilesystemPath ? [`      <div class="command"><strong>Open single-file review board:</strong><br><code>${escapeHtml(`start "" "${candidate.reviewBoardFilesystemPath}"`)}</code></div>`] : []),
            ...(candidate.comparisonFilesystemPath ? [`      <div class="command"><strong>Open compare:</strong><br><code>${escapeHtml(`start "" "${candidate.comparisonFilesystemPath}"`)}</code></div>`] : []),
            ...(candidate.debrisFocusFilesystemPath ? [`      <div class="command"><strong>Open debris focus:</strong><br><code>${escapeHtml(`start "" "${candidate.debrisFocusFilesystemPath}"`)}</code></div>`] : []),
            ...(candidate.diffFilesystemPath ? [`      <div class="command"><strong>Open diff:</strong><br><code>${escapeHtml(`start "" "${candidate.diffFilesystemPath}"`)}</code></div>`] : []),
            ...(candidate.reviewSurfaceLauncher ? [`      <div class="command"><strong>Launch all candidate review surfaces:</strong><br><code>${escapeHtml(candidate.reviewSurfaceLauncher.command)}</code><br>Launcher file: <code>${escapeHtml(candidate.reviewSurfaceLauncher.path)}</code></div>`] : []),
            ...(candidate.rejectCommand ? [`      <div class="command"><strong>Mark reject:</strong><br><code>${escapeHtml(candidate.rejectCommand)}</code></div>`] : []),
            ...(candidate.holdCommand ? [`      <div class="command"><strong>Mark hold:</strong><br><code>${escapeHtml(candidate.holdCommand)}</code></div>`] : []),
            ...(candidate.promoteReviewCommand ? [`      <div class="command"><strong>Mark chosen-for-promotion:</strong><br><code>${escapeHtml(candidate.promoteReviewCommand)}</code></div>`] : []),
          ];
        }),
        '    </ul>',
      ]
    : [
        '    <p>No shortlist available; use the full candidate matrix below.</p>',
      ]),
  '  </section>',
  '  <section class="gate">',
  '    <h2>Acceptance gate</h2>',
  '    <ul>',
  `      <li>${escapeHtml(rejectRule)}</li>`,
  `      <li>${escapeHtml(acceptRule)}</li>`,
  `      <li>${escapeHtml(postPickRule)}</li>`,
  '    </ul>',
  '  </section>',
  ...payload.pending.map((entry) => {
    const overviewRelative = entry.overviewFilesystemPath
      ? path.relative(path.dirname(pendingHtmlPath), entry.overviewFilesystemPath).replace(/\\/g, '/')
      : null;
    const shortlistBoardRelative = entry.shortlistBoardFilesystemPath
      ? path.relative(path.dirname(pendingHtmlPath), entry.shortlistBoardFilesystemPath).replace(/\\/g, '/')
      : null;
    return [
      '  <section class="entry">',
      `    <h2>${escapeHtml(entry.stateId)} · ${escapeHtml(entry.label)}</h2>`,
      `    <p><strong>Decision status:</strong> <code>${escapeHtml(entry.decisionStatus)}</code></p>`,
      `    <p><strong>Review status summary:</strong> unreviewed <code>${escapeHtml(entry.reviewStatusSummary.unreviewed ?? 0)}</code> · hold <code>${escapeHtml(entry.reviewStatusSummary.hold ?? 0)}</code> · reject <code>${escapeHtml(entry.reviewStatusSummary.reject ?? 0)}</code> · promote <code>${escapeHtml(entry.reviewStatusSummary.promote ?? 0)}</code></p>`,
      `    <p><strong>Canonical target:</strong> <code>${escapeHtml(entry.canonicalTarget)}</code></p>`,
      entry.referenceImage
        ? `    <p><strong>Contaminated reference still:</strong> <code>${escapeHtml(entry.referenceImage)}</code>${entry.referenceFingerprint ? `<br>sha256 <code>${escapeHtml(entry.referenceFingerprint.sha256)}</code> · bytes <code>${escapeHtml(entry.referenceFingerprint.bytes)}</code> · modified <code>${escapeHtml(entry.referenceFingerprint.modifiedAt)}</code>` : ''}</p>`
        : '',
      entry.referenceImageFilesystemPath
        ? `    <div class="command"><strong>Open contaminated reference still:</strong><br><code>${escapeHtml(`start "" "${entry.referenceImageFilesystemPath}"`)}</code></div>`
        : '',
      entry.rankedCandidates.length
        ? `    <p><strong>Automated triage ranking:</strong> ${entry.rankedCandidates.map((candidate) => `candidate <code>${escapeHtml(candidate.index)}</code> (#${escapeHtml(candidate.triageRank)}, triage <code>${escapeHtml(candidate.triageScore)}</code>, full-image SSIM <code>${escapeHtml(candidate.fullImageSsim)}</code>, debris-zone change avg <code>${escapeHtml(candidate.debrisZoneChangeAverage)}</code>)`).join(' · ')}</p>`
        : '    <p><strong>Automated triage ranking:</strong> unavailable (metrics failed for all candidates).</p>',
      entry.shortlist.length
        ? `    <p><strong>Priority shortlist:</strong> start with ${entry.shortlist.map((candidate) => `candidate <code>${escapeHtml(candidate.index)}</code> (#${escapeHtml(candidate.triageRank)}, triage <code>${escapeHtml(candidate.triageScore)}</code>, review <code>${escapeHtml(candidate.reviewVerdict ?? defaultReviewVerdict)}</code>)`).join(' · ')}</p>`
        : '    <p><strong>Priority shortlist:</strong> unavailable (no ranked candidates recorded).</p>',
      entry.shortlist.length
        ? `    <p><strong>Shortlist still needing action:</strong> ${entry.pendingShortlist.length ? entry.pendingShortlist.map((candidate) => `candidate <code>${escapeHtml(candidate.index)}</code> (${escapeHtml(candidate.reviewVerdict ?? defaultReviewVerdict)})`).join(' · ') : 'none — shortlist verdicts are already recorded.'}</p>`
        : '',
      entry.shortlistExhaustedWithoutPromotion
        ? `    <p><strong>Shortlist exhausted without promotion:</strong> <code>yes</code><br>Regenerate still batch: <code>${escapeHtml(entry.regenerateStillCommand)}</code><br>Refresh pending-pick artifact after regeneration: <code>${escapeHtml(entry.refreshReviewCommand)}</code></p>`
        : '',
      entry.shortlistExhaustedWithoutPromotion && entry.candidates.some((candidate) => candidate.reviewVerdict === 'unreviewed')
        ? `    <p><strong>Remaining unreviewed fallback candidates before another regeneration:</strong> ${entry.candidates.filter((candidate) => candidate.reviewVerdict === 'unreviewed').map((candidate) => `candidate <code>${escapeHtml(candidate.index)}</code>`).join(' · ')}</p>`
        : '',
      entry.shortlistBoardPath
        ? `    <p><strong>Shortlist board:</strong> <code>${escapeHtml(entry.shortlistBoardPath)}</code></p>`
        : '',
      `    <p><strong>Detailed review:</strong> <code>${escapeHtml(entry.reviewHtml)}</code></p>`,
      `    <p><strong>Post-pick rerender report:</strong> <code>${escapeHtml(entry.postPickRerenderReport)}</code></p>`,
      `    <div class="command"><strong>Open rerender report:</strong><br><code>${escapeHtml(`start "" "${entry.postPickRerenderReportFilesystemPath}"`)}</code></div>`,
      entry.shortlistBoardFilesystemPath
        ? `    <div class="command"><strong>Open shortlist board:</strong><br><code>${escapeHtml(`start "" "${entry.shortlistBoardFilesystemPath}"`)}</code></div>`
        : '',
      overviewRelative
        ? `    <figure style="margin: 16px 0 0;"><img src="${escapeHtml(overviewRelative)}" alt="${escapeHtml(`${entry.stateId} still overview`)}" /><figcaption>Overview image · <code>${escapeHtml(entry.overviewPath)}</code></figcaption></figure>`
        : '',
      shortlistBoardRelative
        ? `    <figure style="margin: 16px 0 0;"><img src="${escapeHtml(shortlistBoardRelative)}" alt="${escapeHtml(`${entry.stateId} shortlist board`)}" /><figcaption>Shortlist board · <code>${escapeHtml(entry.shortlistBoardPath)}</code></figcaption></figure>`
        : '',
      `    <div class="command"><strong>Open overview:</strong><br><code>${escapeHtml(entry.overviewFilesystemPath ? `start "" "${entry.overviewFilesystemPath}"` : 'n/a')}</code></div>`,
      `    <div class="command"><strong>Open detailed review HTML:</strong><br><code>${escapeHtml(`start "" "${path.join(root, entry.reviewHtml.replace(/\//g, path.sep))}"`)}</code></div>`,
      entry.shortlist.length
        ? [
            '    <h3>Priority shortlist</h3>',
            `    <p>${escapeHtml(entry.shortlistSummary)}</p>`,
            '    <ul>',
            ...entry.shortlist.map((candidate) => `      <li>Candidate <code>${escapeHtml(candidate.index)}</code> (#${escapeHtml(candidate.triageRank)}, triage <code>${escapeHtml(candidate.triageScore)}</code>) · compare <code>${escapeHtml(candidate.comparisonPath ?? 'n/a')}</code> · debris-focus <code>${escapeHtml(candidate.debrisFocusPath ?? 'n/a')}</code> · promote <code>${escapeHtml(candidate.promoteCommand ?? 'n/a')}</code></li>`),
            '    </ul>',
            '    <div class="shortlist-grid">',
            ...entry.shortlist.map((candidate) => {
              const fullCandidate = entry.candidates.find((item) => item.index === candidate.index);
              const candidateRelative = candidate.candidateFilesystemPath
                ? path.relative(path.dirname(pendingHtmlPath), candidate.candidateFilesystemPath).replace(/\\/g, '/')
                : null;
              const reviewBoardRelative = candidate.reviewBoardFilesystemPath
                ? path.relative(path.dirname(pendingHtmlPath), candidate.reviewBoardFilesystemPath).replace(/\\/g, '/')
                : null;
              const comparisonRelative = candidate.comparisonFilesystemPath
                ? path.relative(path.dirname(pendingHtmlPath), candidate.comparisonFilesystemPath).replace(/\\/g, '/')
                : null;
              const debrisFocusRelative = candidate.debrisFocusFilesystemPath
                ? path.relative(path.dirname(pendingHtmlPath), candidate.debrisFocusFilesystemPath).replace(/\\/g, '/')
                : null;
              const diffRelative = candidate.diffFilesystemPath
                ? path.relative(path.dirname(pendingHtmlPath), candidate.diffFilesystemPath).replace(/\\/g, '/')
                : null;
              return [
                '      <section class="shortlist-card">',
                `        <h4>Candidate ${escapeHtml(candidate.index)} · rank #${escapeHtml(candidate.triageRank)}</h4>`,
                `        <p>Triage <code>${escapeHtml(candidate.triageScore)}</code> · full-image SSIM <code>${escapeHtml(candidate.fullImageSsim)}</code> · debris-zone change avg <code>${escapeHtml(candidate.debrisZoneChangeAverage)}</code></p>`,
                `        <p><strong>Review verdict:</strong> <code>${escapeHtml(fullCandidate?.reviewVerdict ?? defaultReviewVerdict)}</code></p>`,
                `        <p><strong>Review note:</strong> ${escapeHtml(fullCandidate?.reviewNote ?? defaultReviewNote)}</p>`,
                ...(candidate.watchZones?.length
                  ? [`        <p><strong>Watch first:</strong> ${candidate.watchZones.slice(0, 3).map((zone) => `${escapeHtml(zone.label)} <code>${escapeHtml(zone.ssimText)}</code>`).join(' · ')}</p>`]
                  : []),
                fullCandidate?.fingerprint
                  ? `        <p>sha256 <code>${escapeHtml(fullCandidate.fingerprint.sha256)}</code> · bytes <code>${escapeHtml(fullCandidate.fingerprint.bytes)}</code> · modified <code>${escapeHtml(fullCandidate.fingerprint.modifiedAt)}</code></p>`
                  : '',
                `        <div class="command"><strong>Mark reject:</strong><br><code>${escapeHtml(fullCandidate?.rejectCommand ?? 'n/a')}</code></div>`,
                `        <div class="command"><strong>Mark hold:</strong><br><code>${escapeHtml(fullCandidate?.holdCommand ?? 'n/a')}</code></div>`,
                `        <div class="command"><strong>Mark chosen-for-promotion:</strong><br><code>${escapeHtml(fullCandidate?.promoteReviewCommand ?? 'n/a')}</code></div>`,
                '        <div class="grid">',
                candidateRelative
                  ? `          <figure><img src="${escapeHtml(candidateRelative)}" alt="${escapeHtml(`${entry.stateId} shortlist candidate ${candidate.index}`)}" /><figcaption>Candidate<br><code>${escapeHtml(candidate.candidatePath ?? 'n/a')}</code></figcaption></figure>`
                  : '          <figure><figcaption>Candidate image unavailable</figcaption></figure>',
                reviewBoardRelative
                  ? `          <figure><img src="${escapeHtml(reviewBoardRelative)}" alt="${escapeHtml(`${entry.stateId} shortlist review board ${candidate.index}`)}" /><figcaption>Single-file review board<br><code>${escapeHtml(candidate.reviewBoardPath ?? 'n/a')}</code></figcaption></figure>`
                  : '          <figure><figcaption>Single-file review board unavailable</figcaption></figure>',
                comparisonRelative
                  ? `          <figure><img src="${escapeHtml(comparisonRelative)}" alt="${escapeHtml(`${entry.stateId} shortlist compare ${candidate.index}`)}" /><figcaption>Compare<br><code>${escapeHtml(candidate.comparisonPath ?? 'n/a')}</code></figcaption></figure>`
                  : '          <figure><figcaption>Compare image unavailable</figcaption></figure>',
                debrisFocusRelative
                  ? `          <figure><img src="${escapeHtml(debrisFocusRelative)}" alt="${escapeHtml(`${entry.stateId} shortlist debris focus ${candidate.index}`)}" /><figcaption>Debris focus<br><code>${escapeHtml(candidate.debrisFocusPath ?? 'n/a')}</code></figcaption></figure>`
                  : '          <figure><figcaption>Debris-focus image unavailable</figcaption></figure>',
                diffRelative
                  ? `          <figure><img src="${escapeHtml(diffRelative)}" alt="${escapeHtml(`${entry.stateId} shortlist diff ${candidate.index}`)}" /><figcaption>Diff<br><code>${escapeHtml(candidate.diffPath ?? 'n/a')}</code></figcaption></figure>`
                  : '          <figure><figcaption>Diff image unavailable</figcaption></figure>',
                '        </div>',
                `        <div class="command"><strong>Promote candidate ${escapeHtml(candidate.index)}:</strong><br><code>${escapeHtml(candidate.promoteCommand ?? 'n/a')}</code></div>`,
                candidate.candidateFilesystemPath
                  ? `        <div class="command"><strong>Open candidate:</strong><br><code>${escapeHtml(`start "" "${candidate.candidateFilesystemPath}"`)}</code></div>`
                  : '',
                candidate.reviewBoardFilesystemPath
                  ? `        <div class="command"><strong>Open single-file review board:</strong><br><code>${escapeHtml(`start "" "${candidate.reviewBoardFilesystemPath}"`)}</code></div>`
                  : '',
                candidate.comparisonFilesystemPath
                  ? `        <div class="command"><strong>Open compare:</strong><br><code>${escapeHtml(`start "" "${candidate.comparisonFilesystemPath}"`)}</code></div>`
                  : '',
                candidate.debrisFocusFilesystemPath
                  ? `        <div class="command"><strong>Open debris focus:</strong><br><code>${escapeHtml(`start "" "${candidate.debrisFocusFilesystemPath}"`)}</code></div>`
                  : '',
                candidate.diffFilesystemPath
                  ? `        <div class="command"><strong>Open diff:</strong><br><code>${escapeHtml(`start "" "${candidate.diffFilesystemPath}"`)}</code></div>`
                  : '',
                candidate.reviewSurfaceLauncher
                  ? `        <div class="command"><strong>Launch all candidate review surfaces:</strong><br><code>${escapeHtml(candidate.reviewSurfaceLauncher.command)}</code><br>Launcher file: <code>${escapeHtml(candidate.reviewSurfaceLauncher.path)}</code></div>`
                  : '',
                '      </section>',
              ].filter(Boolean).join('\n');
            }),
            '    </div>',
          ].join('\n')
        : '    <h3>Priority shortlist</h3><p>No ranked shortlist available.</p>',
      '    <h3>Next action</h3>',
      `    <p>${escapeHtml(entry.nextAction)}</p>`,
      '    <div class="grid">',
      ...entry.candidates.map((candidate) => {
        const candidateRelative = path.relative(path.dirname(pendingHtmlPath), candidate.candidateFilesystemPath).replace(/\\/g, '/');
        const reviewBoardRelative = candidate.reviewBoardFilesystemPath
          ? path.relative(path.dirname(pendingHtmlPath), candidate.reviewBoardFilesystemPath).replace(/\\/g, '/')
          : null;
        const comparisonRelative = path.relative(path.dirname(pendingHtmlPath), candidate.comparisonFilesystemPath).replace(/\\/g, '/');
        const debrisFocusRelative = candidate.debrisFocusFilesystemPath
          ? path.relative(path.dirname(pendingHtmlPath), candidate.debrisFocusFilesystemPath).replace(/\\/g, '/')
          : null;
        const diffRelative = candidate.diffFilesystemPath
          ? path.relative(path.dirname(pendingHtmlPath), candidate.diffFilesystemPath).replace(/\\/g, '/')
          : null;
        return [
          '      <figure>',
          `        <img src="${escapeHtml(candidateRelative)}" alt="${escapeHtml(`${entry.stateId} candidate ${candidate.index}`)}" />`,
          `        <figcaption>Candidate ${candidate.index} · <code>${escapeHtml(candidate.candidatePath)}</code>${candidate.fingerprint ? `<br>sha256 <code>${escapeHtml(candidate.fingerprint.sha256)}</code><br>bytes <code>${escapeHtml(candidate.fingerprint.bytes)}</code> · modified <code>${escapeHtml(candidate.fingerprint.modifiedAt)}</code>` : ''}<br>review verdict <code>${escapeHtml(candidate.reviewVerdict ?? defaultReviewVerdict)}</code><br>${escapeHtml(candidate.reviewNote ?? defaultReviewNote)}${candidate.metrics ? `<br>full-image SSIM <code>${escapeHtml(candidate.metrics.fullImageSsim)}</code> · debris-zone change avg <code>${escapeHtml(candidate.metrics.debrisZoneChangeAverage)}</code> · triage <code>${escapeHtml(candidate.metrics.triageScore)}</code><br>zone SSIMs: left <code>${escapeHtml(candidate.metrics.debrisZoneSsim.left)}</code> · upper-right <code>${escapeHtml(candidate.metrics.debrisZoneSsim.upperRight)}</code> · lower-right <code>${escapeHtml(candidate.metrics.debrisZoneSsim.lowerRight)}</code>${candidate.watchZones?.length ? `<br>watch first: ${candidate.watchZones.slice(0, 2).map((zone) => `${escapeHtml(zone.label)} <code>${escapeHtml(zone.ssimText)}</code>`).join(' · ')}` : ''}<br>mark reject <code>${escapeHtml(candidate.rejectCommand ?? 'n/a')}</code><br>mark hold <code>${escapeHtml(candidate.holdCommand ?? 'n/a')}</code><br>mark chosen <code>${escapeHtml(candidate.promoteReviewCommand ?? 'n/a')}</code>` : `<br>metrics failed: ${escapeHtml(candidate.metricsError ?? 'unknown error')}`}</figcaption>`,
          `        <div class="command"><strong>Promote:</strong><br><code>${escapeHtml(candidate.promoteCommand)}</code></div>`,
          '      </figure>',
          '      <figure>',
          reviewBoardRelative
            ? `        <img src="${escapeHtml(reviewBoardRelative)}" alt="${escapeHtml(`${entry.stateId} candidate ${candidate.index} review board`)}" />`
            : '        <div style="min-height: 180px; display:flex; align-items:center; justify-content:center; border-radius:8px; background:#05070d; color:#ffb4b4; padding:12px; text-align:center;">No single-file review board recorded</div>',
          reviewBoardRelative
            ? `        <figcaption>Single-file review board ${candidate.index} · <code>${escapeHtml(candidate.reviewBoardPath)}</code></figcaption>`
            : '        <figcaption>No single-file review board recorded</figcaption>',
          '      </figure>',
          '      <figure>',
          `        <img src="${escapeHtml(comparisonRelative)}" alt="${escapeHtml(`${entry.stateId} candidate ${candidate.index} comparison`)}" />`,
          `        <figcaption>Compare ${candidate.index} · <code>${escapeHtml(candidate.comparisonPath)}</code></figcaption>`,
          '      </figure>',
          '      <figure>',
          debrisFocusRelative
            ? `        <img src="${escapeHtml(debrisFocusRelative)}" alt="${escapeHtml(`${entry.stateId} candidate ${candidate.index} debris focus`)}" />`
            : '        <div style="min-height: 180px; display:flex; align-items:center; justify-content:center; border-radius:8px; background:#05070d; color:#ffb4b4; padding:12px; text-align:center;">No debris-focus artifact recorded</div>',
          debrisFocusRelative
            ? `        <figcaption>Debris focus ${candidate.index} · <code>${escapeHtml(candidate.debrisFocusPath)}</code></figcaption>`
            : '        <figcaption>No debris-focus artifact recorded</figcaption>',
          '      </figure>',
          '      <figure>',
          diffRelative
            ? `        <img src="${escapeHtml(diffRelative)}" alt="${escapeHtml(`${entry.stateId} candidate ${candidate.index} diff`)}" />`
            : '        <div style="min-height: 180px; display:flex; align-items:center; justify-content:center; border-radius:8px; background:#05070d; color:#ffb4b4; padding:12px; text-align:center;">No diff artifact recorded</div>',
          diffRelative
            ? `        <figcaption>Diff ${candidate.index} · <code>${escapeHtml(candidate.diffPath)}</code></figcaption>`
            : '        <figcaption>No diff artifact recorded</figcaption>',
          '      </figure>',
        ].join('\n');
      }),
      '    </div>',
      '  </section>',
    ].join('\n');
  }),
  '</body>',
  '</html>',
];

await writeTextAtomic(pendingHtmlPath, `${htmlLines.join('\n')}\n`);

console.log('Wrote data/generated/pending-still-pick.json, data/generated/pending-still-pick.md, and data/generated/pending-still-pick.html.');

import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const reviewPath = path.join(root, 'data', 'generated', 'still-candidate-review.json');
const outputDir = path.join(root, 'data', 'generated');
const pendingJsonPath = path.join(outputDir, 'pending-still-pick.json');
const pendingMdPath = path.join(outputDir, 'pending-still-pick.md');
const pendingHtmlPath = path.join(outputDir, 'pending-still-pick.html');

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

const defaultStatus = 'No candidate is approved by default. Treat the current batch as blocked until one candidate is explicitly chosen by human review and then survives the follow-up loop rerender acceptance check.';
const rejectRule = 'Reject any candidate whose debris-focus sheet still shows detached rectangular scraps at the left edge, upper-right edge, or lower-right foreground.';
const acceptRule = 'Only promote a candidate if it is truly paper-free in those debris-focus zones and still preserves the approved creature identity, framing, and environment well enough to serve as the cleaned anchor.';
const postPickRule = 'After promotion + rerender, reopen the listed paper-money rerender report and reject the loop again unless both paper-like debris removal and seamless-loop acceptance pass.';
const shortlistCount = 3;
const debrisZoneLabels = {
  left: 'left edge',
  upperRight: 'upper-right edge',
  lowerRight: 'lower-right foreground',
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
      comparisonPath: fullCandidate?.comparisonPath ?? null,
      comparisonFilesystemPath: fullCandidate?.comparisonFilesystemPath ?? null,
      debrisFocusPath: fullCandidate?.debrisFocusComparisonPath ?? fullCandidate?.debrisFocusPath ?? null,
      debrisFocusFilesystemPath: fullCandidate?.debrisFocusComparisonFilesystemPath ?? null,
      promoteCommand: fullCandidate?.promoteCommand ?? null,
      watchZones: buildWatchZones(fullCandidate?.metrics ?? candidate),
    };
  });

  const shortlistBoard = await buildShortlistBoard({ stateId: entry.stateId, shortlist });

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
    candidates: entry.outputs.map((output) => ({
      index: output.index,
      candidatePath: output.path,
      candidateFilesystemPath: output.filesystemPath ?? path.join(root, output.path.replace(/^[/\\]+/, '').replace(/\//g, path.sep)),
      fingerprint: output.fingerprint ?? null,
      metrics: output.metrics ?? null,
      metricsError: output.metricsError ?? null,
      watchZones: buildWatchZones(output.metrics),
      comparisonPath: output.comparisonPath,
      comparisonFilesystemPath: output.comparisonFilesystemPath ?? path.join(root, output.comparisonPath.replace(/^[/\\]+/, '').replace(/\//g, path.sep)),
      debrisFocusPath: output.debrisFocusComparisonPath ?? output.debrisFocusPath ?? null,
      debrisFocusFilesystemPath: output.debrisFocusComparisonFilesystemPath ?? (output.debrisFocusComparisonPath ? path.join(root, output.debrisFocusComparisonPath.replace(/^[/\\]+/, '').replace(/\//g, path.sep)) : null),
      promoteCommand: output.promoteCommand,
    })),
    rankedCandidates,
    shortlist,
    shortlistBoardPath: shortlistBoard.shortlistBoardPath,
    shortlistBoardFilesystemPath: shortlistBoard.shortlistBoardFilesystemPath,
    shortlistBoardStatus: shortlistBoard.shortlistBoardStatus,
    shortlistBoardError: shortlistBoard.shortlistBoardError,
    shortlistSummary: shortlist.length
      ? `Start with shortlist candidates ${shortlist.map((candidate) => candidate.index).join(', ')} in that order.`
      : 'No ranked shortlist is available for this batch.',
    decisionStatus: 'pending-human-pick',
    nextAction: shortlist.length
      ? `Start with shortlist candidates ${shortlist.map((candidate) => candidate.index).join(', ')} in that order, reject any option whose debris-focus sheet still shows detached rectangular scraps, then promote exactly one truly paper-free candidate and reopen the rerender report after the loop rerun.`
      : 'Use the overview + compare + debris-focus surfaces to choose exactly one truly paper-free candidate, run its listed promote:still command without --dry-run, then reopen the paper-money rerender report to review the refreshed loop acceptance evidence.',
  };
}));

const pendingStartHere = pendingEntries.flatMap((entry) =>
  entry.shortlist.map((candidate) => ({
    stateId: entry.stateId,
    label: entry.label,
    shortlistBoardPath: entry.shortlistBoardPath,
    index: candidate.index,
    triageRank: candidate.triageRank,
    triageScore: candidate.triageScore,
    comparisonPath: candidate.comparisonPath,
    debrisFocusPath: candidate.debrisFocusPath,
    promoteCommand: candidate.promoteCommand,
  }))
);

const payload = {
  recordedAt: new Date().toISOString(),
  sourceReviewRecordedAt: review.recordedAt,
  stateFilter: selectedState,
  defaultStatus,
  rejectRule,
  acceptRule,
  postPickRule,
  shortlistCount,
  startHere: pendingStartHere,
  pending: pendingEntries,
};

await fs.writeFile(pendingJsonPath, `${JSON.stringify(payload, null, 2)}\n`);

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
  ...(payload.startHere.length
    ? [
        '- Review the shortlist candidates in this order before scanning the full matrix:',
        ...Array.from(new Set(payload.startHere.map((candidate) => candidate.shortlistBoardPath).filter(Boolean))).map((shortlistBoardPath) => `- Shared shortlist board: \`${shortlistBoardPath}\``),
        ...payload.startHere.map((candidate) => {
          const pendingEntry = payload.pending.find((entry) => entry.stateId === candidate.stateId);
          const shortlistCandidate = pendingEntry?.shortlist.find((item) => item.index === candidate.index);
          const watchSummary = shortlistCandidate?.watchZones?.length
            ? ` · watch first: ${shortlistCandidate.watchZones.slice(0, 2).map((zone) => `${zone.label} (${zone.ssimText})`).join(', ')}`
            : '';
          return `  - ${candidate.stateId} candidate ${candidate.index} (#${candidate.triageRank}, triage \`${candidate.triageScore}\`) · compare \`${candidate.comparisonPath}\` · debris-focus \`${candidate.debrisFocusPath ?? '—'}\`${watchSummary} · promote \`${candidate.promoteCommand ?? '—'}\``;
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
        ...(entry.shortlistBoardPath ? [`- Shortlist board: \`${entry.shortlistBoardPath}\``] : []),
        ...(entry.shortlistBoardFilesystemPath ? [`- Open shortlist board: \`start "" "${entry.shortlistBoardFilesystemPath}"\``] : []),
        ...(entry.shortlistBoardError ? [`- Shortlist board status: \`${entry.shortlistBoardStatus}\` · ${entry.shortlistBoardError}`] : []),
        ...entry.shortlist.map((candidate) => `  - Candidate ${candidate.index} (#${candidate.triageRank}) · triage \`${candidate.triageScore}\` · compare \`${candidate.comparisonPath}\` · debris-focus \`${candidate.debrisFocusPath}\` · promote \`${candidate.promoteCommand}\``),
      ]
      : ['- Priority shortlist: unavailable (no ranked candidates recorded).']),
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
            `- Compare image: \`${candidate.comparisonPath ?? '—'}\``,
            `- Debris-focus image: \`${candidate.debrisFocusPath ?? '—'}\``,
            ...(candidate.watchZones?.length
              ? [
                '- Watch zones (highest similarity to the contaminated reference first):',
                ...candidate.watchZones.map((zone) => `  - ${zone.label} · SSIM \`${zone.ssimText}\` · change \`${zone.changeText}\` · ${zone.reviewNote}`),
              ]
              : []),
            `- Promote command: \`${candidate.promoteCommand ?? '—'}\``,
            ...(candidate.candidateFilesystemPath ? [`- Open candidate: \`start "" "${candidate.candidateFilesystemPath}"\``] : []),
            ...(candidate.comparisonFilesystemPath ? [`- Open compare: \`start "" "${candidate.comparisonFilesystemPath}"\``] : []),
            ...(candidate.debrisFocusFilesystemPath ? [`- Open debris-focus: \`start "" "${candidate.debrisFocusFilesystemPath}"\``] : []),
            '',
          ];
        }),
      ]
      : []),
    `- Next action: ${entry.nextAction}`,
    '',
    '| Candidate | Candidate image | Fingerprint | Metrics | Watch first | Compare image | Debris-focus image | Promote command |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...entry.candidates.map((candidate) => `| ${candidate.index} | \`${candidate.candidatePath}\` | ${candidate.fingerprint ? `sha256 \`${candidate.fingerprint.sha256}\`<br>bytes \`${candidate.fingerprint.bytes}\`<br>modified \`${candidate.fingerprint.modifiedAt}\`` : '—'} | ${candidate.metrics ? `full SSIM \`${candidate.metrics.fullImageSsim}\`<br>left \`${candidate.metrics.debrisZoneSsim.left}\`<br>upper-right \`${candidate.metrics.debrisZoneSsim.upperRight}\`<br>lower-right \`${candidate.metrics.debrisZoneSsim.lowerRight}\`<br>debris change avg \`${candidate.metrics.debrisZoneChangeAverage}\`<br>triage \`${candidate.metrics.triageScore}\`` : `metrics failed: ${candidate.metricsError ?? 'unknown error'}`} | ${candidate.watchZones?.length ? candidate.watchZones.slice(0, 2).map((zone) => `${zone.label} \`${zone.ssimText}\``).join('<br>') : '—'} | \`${candidate.comparisonPath}\` | ${candidate.debrisFocusPath ? `\`${candidate.debrisFocusPath}\`` : '—'} | \`${candidate.promoteCommand}\` |`),
    '',
  ]),
];

await fs.writeFile(pendingMdPath, `${mdLines.join('\n')}\n`);

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
  '    .triple { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin: 12px 0; }',
  '    .triple figure { padding: 8px; }',
  '    .triple figcaption { font-size: 12px; }',
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
  ...(payload.startHere.length
    ? [
        '    <p>Review the shortlist candidates in this order before scanning the full matrix:</p>',
        ...Array.from(new Set(payload.startHere.map((candidate) => candidate.shortlistBoardPath).filter(Boolean))).map((shortlistBoardPath) => `    <p><strong>Shared shortlist board:</strong> <code>${escapeHtml(shortlistBoardPath)}</code></p>`),
        '    <ul>',
        ...payload.startHere.map((candidate) => {
          const pendingEntry = payload.pending.find((entry) => entry.stateId === candidate.stateId);
          const shortlistCandidate = pendingEntry?.shortlist.find((item) => item.index === candidate.index);
          const watchSummary = shortlistCandidate?.watchZones?.length
            ? ` · watch first ${shortlistCandidate.watchZones.slice(0, 2).map((zone) => `${zone.label} (${zone.ssimText})`).join(', ')}`
            : '';
          return `      <li>${escapeHtml(candidate.stateId)} candidate <code>${escapeHtml(candidate.index)}</code> (#${escapeHtml(candidate.triageRank)}, triage <code>${escapeHtml(candidate.triageScore)}</code>) · compare <code>${escapeHtml(candidate.comparisonPath ?? 'n/a')}</code> · debris-focus <code>${escapeHtml(candidate.debrisFocusPath ?? 'n/a')}</code>${escapeHtml(watchSummary)} · promote <code>${escapeHtml(candidate.promoteCommand ?? 'n/a')}</code></li>`;
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
      `    <p><strong>Canonical target:</strong> <code>${escapeHtml(entry.canonicalTarget)}</code></p>`,
      entry.referenceImage
        ? `    <p><strong>Contaminated reference still:</strong> <code>${escapeHtml(entry.referenceImage)}</code>${entry.referenceFingerprint ? `<br>sha256 <code>${escapeHtml(entry.referenceFingerprint.sha256)}</code> · bytes <code>${escapeHtml(entry.referenceFingerprint.bytes)}</code> · modified <code>${escapeHtml(entry.referenceFingerprint.modifiedAt)}</code>` : ''}</p>`
        : '',
      entry.rankedCandidates.length
        ? `    <p><strong>Automated triage ranking:</strong> ${entry.rankedCandidates.map((candidate) => `candidate <code>${escapeHtml(candidate.index)}</code> (#${escapeHtml(candidate.triageRank)}, triage <code>${escapeHtml(candidate.triageScore)}</code>, full-image SSIM <code>${escapeHtml(candidate.fullImageSsim)}</code>, debris-zone change avg <code>${escapeHtml(candidate.debrisZoneChangeAverage)}</code>)`).join(' · ')}</p>`
        : '    <p><strong>Automated triage ranking:</strong> unavailable (metrics failed for all candidates).</p>',
      entry.shortlist.length
        ? `    <p><strong>Priority shortlist:</strong> start with ${entry.shortlist.map((candidate) => `candidate <code>${escapeHtml(candidate.index)}</code> (#${escapeHtml(candidate.triageRank)}, triage <code>${escapeHtml(candidate.triageScore)}</code>)`).join(' · ')}</p>`
        : '    <p><strong>Priority shortlist:</strong> unavailable (no ranked candidates recorded).</p>',
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
            const comparisonRelative = candidate.comparisonFilesystemPath
              ? path.relative(path.dirname(pendingHtmlPath), candidate.comparisonFilesystemPath).replace(/\\/g, '/')
              : null;
            const debrisFocusRelative = candidate.debrisFocusFilesystemPath
              ? path.relative(path.dirname(pendingHtmlPath), candidate.debrisFocusFilesystemPath).replace(/\\/g, '/')
              : null;
            return [
              '      <section class="shortlist-card">',
              `        <h4>Candidate ${escapeHtml(candidate.index)} · rank #${escapeHtml(candidate.triageRank)}</h4>`,
              `        <p>Triage <code>${escapeHtml(candidate.triageScore)}</code> · full-image SSIM <code>${escapeHtml(candidate.fullImageSsim)}</code> · debris-zone change avg <code>${escapeHtml(candidate.debrisZoneChangeAverage)}</code></p>`,
              ...(candidate.watchZones?.length
                ? [`        <p><strong>Watch first:</strong> ${candidate.watchZones.slice(0, 3).map((zone) => `${escapeHtml(zone.label)} <code>${escapeHtml(zone.ssimText)}</code>`).join(' · ')}</p>`]
                : []),
              fullCandidate?.fingerprint
                ? `        <p>sha256 <code>${escapeHtml(fullCandidate.fingerprint.sha256)}</code> · bytes <code>${escapeHtml(fullCandidate.fingerprint.bytes)}</code> · modified <code>${escapeHtml(fullCandidate.fingerprint.modifiedAt)}</code></p>`
                : '',
              '        <div class="triple">',
              candidateRelative
                ? `          <figure><img src="${escapeHtml(candidateRelative)}" alt="${escapeHtml(`${entry.stateId} shortlist candidate ${candidate.index}`)}" /><figcaption>Candidate<br><code>${escapeHtml(candidate.candidatePath ?? 'n/a')}</code></figcaption></figure>`
                : '          <figure><figcaption>Candidate image unavailable</figcaption></figure>',
              comparisonRelative
                ? `          <figure><img src="${escapeHtml(comparisonRelative)}" alt="${escapeHtml(`${entry.stateId} shortlist compare ${candidate.index}`)}" /><figcaption>Compare<br><code>${escapeHtml(candidate.comparisonPath ?? 'n/a')}</code></figcaption></figure>`
                : '          <figure><figcaption>Compare image unavailable</figcaption></figure>',
              debrisFocusRelative
                ? `          <figure><img src="${escapeHtml(debrisFocusRelative)}" alt="${escapeHtml(`${entry.stateId} shortlist debris focus ${candidate.index}`)}" /><figcaption>Debris focus<br><code>${escapeHtml(candidate.debrisFocusPath ?? 'n/a')}</code></figcaption></figure>`
                : '          <figure><figcaption>Debris-focus image unavailable</figcaption></figure>',
              '        </div>',
              `        <div class="command"><strong>Promote candidate ${escapeHtml(candidate.index)}:</strong><br><code>${escapeHtml(candidate.promoteCommand ?? 'n/a')}</code></div>`,
              candidate.candidateFilesystemPath
                ? `        <div class="command"><strong>Open candidate:</strong><br><code>${escapeHtml(`start "" "${candidate.candidateFilesystemPath}"`)}</code></div>`
                : '',
              candidate.comparisonFilesystemPath
                ? `        <div class="command"><strong>Open compare:</strong><br><code>${escapeHtml(`start "" "${candidate.comparisonFilesystemPath}"`)}</code></div>`
                : '',
              candidate.debrisFocusFilesystemPath
                ? `        <div class="command"><strong>Open debris focus:</strong><br><code>${escapeHtml(`start "" "${candidate.debrisFocusFilesystemPath}"`)}</code></div>`
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
        const comparisonRelative = path.relative(path.dirname(pendingHtmlPath), candidate.comparisonFilesystemPath).replace(/\\/g, '/');
        const debrisFocusRelative = candidate.debrisFocusFilesystemPath
          ? path.relative(path.dirname(pendingHtmlPath), candidate.debrisFocusFilesystemPath).replace(/\\/g, '/')
          : null;
        return [
          '      <figure>',
          `        <img src="${escapeHtml(candidateRelative)}" alt="${escapeHtml(`${entry.stateId} candidate ${candidate.index}`)}" />`,
          `        <figcaption>Candidate ${candidate.index} · <code>${escapeHtml(candidate.candidatePath)}</code>${candidate.fingerprint ? `<br>sha256 <code>${escapeHtml(candidate.fingerprint.sha256)}</code><br>bytes <code>${escapeHtml(candidate.fingerprint.bytes)}</code> · modified <code>${escapeHtml(candidate.fingerprint.modifiedAt)}</code>` : ''}${candidate.metrics ? `<br>full-image SSIM <code>${escapeHtml(candidate.metrics.fullImageSsim)}</code> · debris-zone change avg <code>${escapeHtml(candidate.metrics.debrisZoneChangeAverage)}</code> · triage <code>${escapeHtml(candidate.metrics.triageScore)}</code><br>zone SSIMs: left <code>${escapeHtml(candidate.metrics.debrisZoneSsim.left)}</code> · upper-right <code>${escapeHtml(candidate.metrics.debrisZoneSsim.upperRight)}</code> · lower-right <code>${escapeHtml(candidate.metrics.debrisZoneSsim.lowerRight)}</code>${candidate.watchZones?.length ? `<br>watch first: ${candidate.watchZones.slice(0, 2).map((zone) => `${escapeHtml(zone.label)} <code>${escapeHtml(zone.ssimText)}</code>`).join(' · ')}` : ''}` : `<br>metrics failed: ${escapeHtml(candidate.metricsError ?? 'unknown error')}`}</figcaption>`,
          `        <div class="command"><strong>Promote:</strong><br><code>${escapeHtml(candidate.promoteCommand)}</code></div>`,
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
        ].join('\n');
      }),
      '    </div>',
      '  </section>',
    ].join('\n');
  }),
  '</body>',
  '</html>',
];

await fs.writeFile(pendingHtmlPath, `${htmlLines.join('\n')}\n`);

console.log(`Wrote data/generated/pending-still-pick.json, data/generated/pending-still-pick.md, and data/generated/pending-still-pick.html.`);

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const resultsPath = path.join(root, 'data', 'generated', 'canonical-image-generation-results.json');
const outputDir = path.join(root, 'data', 'generated');
const reviewJsonPath = path.join(outputDir, 'still-candidate-review.json');
const reviewMdPath = path.join(outputDir, 'still-candidate-review.md');
const reviewHtmlPath = path.join(outputDir, 'still-candidate-review.html');

const selectedStateArg = process.argv.find((arg) => arg.startsWith('--state='));
const selectedState = selectedStateArg ? selectedStateArg.split('=')[1].trim() : null;

const defaultLoopVariant = 'b';
const defaultLoopTimeoutMs = '900000';
const defaultLoopModel = 'fal-ai/kling-video/v2.1/standard/image-to-video';

const relativeFromRoot = (targetPath) => path.relative(root, targetPath).replace(/\\/g, '/');
const resolveFromRoot = (relativePath) => path.join(root, relativePath.replace(/^[/\\]+/, '').replace(/\//g, path.sep));
const escapeHtml = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const readJson = async (targetPath) => JSON.parse(await fs.readFile(targetPath, 'utf8'));

const ensureDir = async (targetPath) => {
  await fs.mkdir(targetPath, { recursive: true });
};

const getFileFingerprint = async (targetPath) => {
  const buffer = await fs.readFile(targetPath);
  const stats = await fs.stat(targetPath);
  return {
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
    bytes: stats.size,
    modifiedAt: stats.mtime.toISOString(),
  };
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

const runFfmpegComparison = async ({ referencePath, candidatePath, outputPath }) => runFfmpeg({
  inputPaths: [referencePath, candidatePath],
  filterComplex: 'hstack=inputs=2',
  outputPath,
  errorLabel: 'ffmpeg comparison build failed',
});

const runFfmpegDebrisFocusComparison = async ({ referencePath, candidatePath, outputPath }) => runFfmpeg({
  inputPaths: [referencePath, candidatePath],
  filterComplex: [
    '[0:v]split=3[rLeft][rUpperRight][rLowerRight];',
    '[1:v]split=3[cLeft][cUpperRight][cLowerRight];',
    '[rLeft]crop=iw*0.28:ih*0.60:0:ih*0.18[rLeftCrop];',
    '[cLeft]crop=iw*0.28:ih*0.60:0:ih*0.18[cLeftCrop];',
    '[rLeftCrop][cLeftCrop]hstack=inputs=2[rowLeft];',
    '[rUpperRight]crop=iw*0.28:ih*0.32:iw*0.72:0[rUpperRightCrop];',
    '[cUpperRight]crop=iw*0.28:ih*0.32:iw*0.72:0[cUpperRightCrop];',
    '[rUpperRightCrop][cUpperRightCrop]hstack=inputs=2[rowUpperRight];',
    '[rLowerRight]crop=iw*0.28:ih*0.34:iw*0.72:ih*0.66[rLowerRightCrop];',
    '[cLowerRight]crop=iw*0.28:ih*0.34:iw*0.72:ih*0.66[cLowerRightCrop];',
    '[rLowerRightCrop][cLowerRightCrop]hstack=inputs=2[rowLowerRight];',
    '[rowLeft][rowUpperRight][rowLowerRight]vstack=inputs=3',
  ].join(''),
  outputPath,
  errorLabel: 'ffmpeg debris-focus comparison build failed',
});

const runFfmpegDiffComparison = async ({ referencePath, candidatePath, outputPath }) => runFfmpeg({
  inputPaths: [referencePath, candidatePath],
  filterComplex: [
    '[0:v][1:v]blend=all_mode=difference[diffRaw];',
    '[diffRaw]eq=contrast=2.2:brightness=0.02:saturation=0.0[diffEnhanced];',
    '[0:v][1:v]hstack=inputs=2[top];',
    '[diffEnhanced]scale=iw*2:-1[bottom];',
    '[top][bottom]vstack=inputs=2',
  ].join(''),
  outputPath,
  errorLabel: 'ffmpeg diff comparison build failed',
});

const runFfmpegCandidateReviewBoard = async ({ candidatePath, comparisonPath, debrisFocusPath, diffPath, outputPath }) => runFfmpeg({
  inputPaths: [candidatePath, comparisonPath, debrisFocusPath, diffPath],
  filterComplex: [
    '[0:v]scale=1536:-1[candidate];',
    '[1:v]scale=1536:-1[compare];',
    '[2:v]scale=1536:-1[debris];',
    '[3:v]scale=1536:-1[diff];',
    '[candidate][compare][debris][diff]vstack=inputs=4',
  ].join(''),
  outputPath,
  errorLabel: 'ffmpeg candidate review board build failed',
});

const runFfmpegOverview = async ({ inputPaths, outputPath }) => runFfmpeg({
  inputPaths,
  filterComplex: `hstack=inputs=${inputPaths.length}`,
  outputPath,
  errorLabel: 'ffmpeg overview build failed',
});

const readSsimAll = (output) => {
  const match = output.match(/All:([0-9.]+)/);
  if (!match) {
    throw new Error('Unable to parse SSIM output.');
  }

  return Number.parseFloat(match[1]);
};

const measureSsim = async ({ referencePath, candidatePath, cropFilter = null }) => {
  const filter = cropFilter
    ? `${cropFilter};[r][c]ssim`
    : 'ssim';
  const result = spawnSync('ffmpeg', [
    '-i', referencePath,
    '-i', candidatePath,
    '-lavfi', filter,
    '-f', 'null',
    process.platform === 'win32' ? 'NUL' : '/dev/null',
  ], { encoding: 'utf8' });

  const combined = `${result.stdout || ''}\n${result.stderr || ''}`;
  if (result.status !== 0 && !combined.includes('All:')) {
    throw new Error((result.stderr || result.stdout || 'ffmpeg SSIM measurement failed').trim());
  }

  return readSsimAll(combined);
};

const buildDebrisCropFilter = (zone) => {
  switch (zone) {
    case 'left':
      return '[0:v]crop=iw*0.28:ih*0.60:0:ih*0.18[r];[1:v]crop=iw*0.28:ih*0.60:0:ih*0.18[c]';
    case 'upperRight':
      return '[0:v]crop=iw*0.28:ih*0.32:iw*0.72:0[r];[1:v]crop=iw*0.28:ih*0.32:iw*0.72:0[c]';
    case 'lowerRight':
      return '[0:v]crop=iw*0.28:ih*0.34:iw*0.72:ih*0.66[r];[1:v]crop=iw*0.28:ih*0.34:iw*0.72:ih*0.66[c]';
    default:
      throw new Error(`Unsupported debris zone: ${zone}`);
  }
};

const buildPromoteCommand = (stateId, candidateIndex) => (
  `npm run promote:still -- --state=${stateId} --candidate=${candidateIndex} --variant=${defaultLoopVariant} --stage-loop-rerender --timeout-ms=${defaultLoopTimeoutMs} --model=${defaultLoopModel}`
);

const results = await readJson(resultsPath);
const filtered = results.filter((item) => !selectedState || item.stateId === selectedState);

if (!filtered.length) {
  console.log(selectedState ? `No still-generation results found for ${selectedState}.` : 'No still-generation results found.');
  process.exit(0);
}

const generated = filtered.filter((item) => item.status === 'generated');
const recordedAt = new Date().toISOString();

const reviewEntries = await Promise.all(generated.map(async (item) => {
  const referenceImage = item.image;
  const referenceImageFilesystemPath = resolveFromRoot(referenceImage);
  const referenceFingerprint = await getFileFingerprint(referenceImageFilesystemPath);
  const outputs = await Promise.all((item.outputs ?? []).map(async (outputPath, index) => {
    const filesystemPath = resolveFromRoot(outputPath);
    const comparisonRelativePath = path.join(
      'out',
      `${item.stateId}-still-regeneration`,
      `${item.stateId}-still-regeneration-${String(index + 1).padStart(2, '0')}-compare.png`,
    ).replace(/\\/g, '/');
    const comparisonFilesystemPath = resolveFromRoot(comparisonRelativePath);
    const debrisFocusComparisonRelativePath = path.join(
      'out',
      `${item.stateId}-still-regeneration`,
      `${item.stateId}-still-regeneration-${String(index + 1).padStart(2, '0')}-debris-focus.png`,
    ).replace(/\\/g, '/');
    const debrisFocusComparisonFilesystemPath = resolveFromRoot(debrisFocusComparisonRelativePath);
    const diffComparisonRelativePath = path.join(
      'out',
      `${item.stateId}-still-regeneration`,
      `${item.stateId}-still-regeneration-${String(index + 1).padStart(2, '0')}-diff.png`,
    ).replace(/\\/g, '/');
    const diffComparisonFilesystemPath = resolveFromRoot(diffComparisonRelativePath);
    const reviewBoardRelativePath = path.join(
      'out',
      `${item.stateId}-still-regeneration`,
      `${item.stateId}-still-regeneration-${String(index + 1).padStart(2, '0')}-review-board.png`,
    ).replace(/\\/g, '/');
    const reviewBoardFilesystemPath = resolveFromRoot(reviewBoardRelativePath);

    let comparisonStatus = 'generated';
    let comparisonError = null;

    try {
      await runFfmpegComparison({
        referencePath: referenceImageFilesystemPath,
        candidatePath: filesystemPath,
        outputPath: comparisonFilesystemPath,
      });
    } catch (error) {
      comparisonStatus = 'failed';
      comparisonError = error instanceof Error ? error.message : String(error);
    }

    let debrisFocusStatus = 'generated';
    let debrisFocusError = null;

    try {
      await runFfmpegDebrisFocusComparison({
        referencePath: referenceImageFilesystemPath,
        candidatePath: filesystemPath,
        outputPath: debrisFocusComparisonFilesystemPath,
      });
    } catch (error) {
      debrisFocusStatus = 'failed';
      debrisFocusError = error instanceof Error ? error.message : String(error);
    }

    let diffComparisonStatus = 'generated';
    let diffComparisonError = null;

    try {
      await runFfmpegDiffComparison({
        referencePath: referenceImageFilesystemPath,
        candidatePath: filesystemPath,
        outputPath: diffComparisonFilesystemPath,
      });
    } catch (error) {
      diffComparisonStatus = 'failed';
      diffComparisonError = error instanceof Error ? error.message : String(error);
    }

    let reviewBoardStatus = 'generated';
    let reviewBoardError = null;

    try {
      await runFfmpegCandidateReviewBoard({
        candidatePath: filesystemPath,
        comparisonPath: comparisonFilesystemPath,
        debrisFocusPath: debrisFocusComparisonFilesystemPath,
        diffPath: diffComparisonFilesystemPath,
        outputPath: reviewBoardFilesystemPath,
      });
    } catch (error) {
      reviewBoardStatus = 'failed';
      reviewBoardError = error instanceof Error ? error.message : String(error);
    }

    const fingerprint = await getFileFingerprint(filesystemPath);

    let metrics = null;
    let metricsError = null;

    try {
      const fullImageSsim = await measureSsim({
        referencePath: referenceImageFilesystemPath,
        candidatePath: filesystemPath,
      });
      const leftZoneSsim = await measureSsim({
        referencePath: referenceImageFilesystemPath,
        candidatePath: filesystemPath,
        cropFilter: buildDebrisCropFilter('left'),
      });
      const upperRightZoneSsim = await measureSsim({
        referencePath: referenceImageFilesystemPath,
        candidatePath: filesystemPath,
        cropFilter: buildDebrisCropFilter('upperRight'),
      });
      const lowerRightZoneSsim = await measureSsim({
        referencePath: referenceImageFilesystemPath,
        candidatePath: filesystemPath,
        cropFilter: buildDebrisCropFilter('lowerRight'),
      });
      const debrisZoneChangeAverage = Number((((1 - leftZoneSsim) + (1 - upperRightZoneSsim) + (1 - lowerRightZoneSsim)) / 3).toFixed(4));
      const fullImageRetention = Number(fullImageSsim.toFixed(4));
      const triageScore = Number((fullImageRetention * 0.65 + debrisZoneChangeAverage * 0.35).toFixed(4));

      metrics = {
        fullImageSsim: fullImageRetention,
        debrisZoneSsim: {
          left: Number(leftZoneSsim.toFixed(4)),
          upperRight: Number(upperRightZoneSsim.toFixed(4)),
          lowerRight: Number(lowerRightZoneSsim.toFixed(4)),
        },
        debrisZoneChangeAverage,
        triageScore,
      };
    } catch (error) {
      metricsError = error instanceof Error ? error.message : String(error);
    }

    return {
      index: index + 1,
      path: outputPath,
      filesystemPath,
      fingerprint,
      comparisonPath: comparisonRelativePath,
      comparisonFilesystemPath,
      comparisonStatus,
      comparisonError,
      debrisFocusComparisonPath: debrisFocusComparisonRelativePath,
      debrisFocusComparisonFilesystemPath,
      debrisFocusStatus,
      debrisFocusError,
      diffComparisonPath: diffComparisonRelativePath,
      diffComparisonFilesystemPath,
      diffComparisonStatus,
      diffComparisonError,
      reviewBoardPath: reviewBoardRelativePath,
      reviewBoardFilesystemPath,
      reviewBoardStatus,
      reviewBoardError,
      metrics,
      metricsError,
      promoteCommand: buildPromoteCommand(item.stateId, index + 1),
    };
  }));

  const overviewRelativePath = path.join(
    'out',
    `${item.stateId}-still-regeneration`,
    `${item.stateId}-still-regeneration-overview.png`,
  ).replace(/\\/g, '/');
  const overviewFilesystemPath = resolveFromRoot(overviewRelativePath);

  let overviewStatus = 'generated';
  let overviewError = null;

  try {
    await runFfmpegOverview({
      inputPaths: [referenceImageFilesystemPath, ...outputs.map((output) => output.filesystemPath)],
      outputPath: overviewFilesystemPath,
    });
  } catch (error) {
    overviewStatus = 'failed';
    overviewError = error instanceof Error ? error.message : String(error);
  }

  const rankedCandidates = outputs
    .filter((output) => output.metrics)
    .slice()
    .sort((a, b) => {
      if (b.metrics.triageScore !== a.metrics.triageScore) {
        return b.metrics.triageScore - a.metrics.triageScore;
      }
      if (b.metrics.debrisZoneChangeAverage !== a.metrics.debrisZoneChangeAverage) {
        return b.metrics.debrisZoneChangeAverage - a.metrics.debrisZoneChangeAverage;
      }
      return b.metrics.fullImageSsim - a.metrics.fullImageSsim;
    })
    .map((output, rankIndex) => ({
      index: output.index,
      triageRank: rankIndex + 1,
      triageScore: output.metrics.triageScore,
      fullImageSsim: output.metrics.fullImageSsim,
      debrisZoneChangeAverage: output.metrics.debrisZoneChangeAverage,
    }));

  return {
    stateId: item.stateId,
    stateIndex: item.stateIndex,
    label: item.label,
    provider: item.provider,
    model: item.model,
    canonicalTarget: item.canonicalTarget,
    referenceImage,
    referenceImageFilesystemPath,
    referenceFingerprint,
    renderManifestPath: item.renderManifestPath,
    renderPromptPath: item.renderPromptPath,
    defaultLoopVariant,
    defaultLoopTimeoutMs,
    defaultLoopModel,
    overviewPath: overviewRelativePath,
    overviewFilesystemPath,
    overviewStatus,
    overviewError,
    outputs,
    rankedCandidates,
    notes: item.notes ?? null,
  };
}));

const reviewPayload = {
  recordedAt,
  stateFilter: selectedState,
  entries: reviewEntries,
};

await fs.writeFile(reviewJsonPath, `${JSON.stringify(reviewPayload, null, 2)}\n`);

const mdLines = [
  '# Still candidate review',
  '',
  'Generated by `node scripts/build-still-candidate-review.mjs`.',
  '',
  `Recorded at: ${recordedAt}`,
  `State filter: ${selectedState ?? 'all generated still jobs'}`,
  '',
  ...reviewEntries.flatMap((entry) => [
    `## ${entry.stateId} · ${entry.label}`,
    '',
    `- Provider: \`${entry.provider}\``,
    `- Model: \`${entry.model}\``,
    `- Canonical target: \`${entry.canonicalTarget}\``,
    `- Reference still: \`${entry.referenceImage}\``,
    `- Reference still file: \`${entry.referenceImageFilesystemPath}\``,
    `- Reference fingerprint: sha256 \`${entry.referenceFingerprint.sha256}\` · bytes \`${entry.referenceFingerprint.bytes}\` · modified \`${entry.referenceFingerprint.modifiedAt}\``,
    ...(entry.renderManifestPath ? [`- Render manifest: \`${entry.renderManifestPath}\``] : []),
    ...(entry.renderPromptPath ? [`- Render prompt: \`${entry.renderPromptPath}\``] : []),
    ...(entry.notes ? [`- Generation notes: ${entry.notes}`] : []),
    `- Default follow-up loop variant: \`${entry.defaultLoopVariant}\``,
    `- Default follow-up loop model: \`${entry.defaultLoopModel}\``,
    `- Default follow-up timeout: \`${entry.defaultLoopTimeoutMs}\``,
    `- Candidate overview sheet: ${entry.overviewStatus === 'generated' ? `\`${entry.overviewPath}\`` : `overview failed: ${entry.overviewError}`}`,
    `- Open overview: ${entry.overviewStatus === 'generated' ? `\`start "" "${entry.overviewFilesystemPath}"\`` : 'n/a'}`,
    ...(entry.rankedCandidates.length
      ? [
        '- Automated triage ranking (higher score = stronger whole-image retention plus more change in the known debris zones):',
        ...entry.rankedCandidates.map((candidate) => `  ${candidate.triageRank}. candidate ${candidate.index} · triage \`${candidate.triageScore}\` · full-image SSIM \`${candidate.fullImageSsim}\` · debris-zone change avg \`${candidate.debrisZoneChangeAverage}\``),
      ]
      : ['- Automated triage ranking: unavailable (metrics failed for all candidates).']),
    '',
    '| Candidate | File | Fingerprint | Metrics | Review board | Compare image | Debris-focus image | Diff image | Open commands | Promote command |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...entry.outputs.map((output) => `| ${output.index} | \`${output.path}\` | sha256 \`${output.fingerprint.sha256}\`<br>bytes \`${output.fingerprint.bytes}\`<br>modified \`${output.fingerprint.modifiedAt}\` | ${output.metrics ? `full SSIM \`${output.metrics.fullImageSsim}\`<br>left \`${output.metrics.debrisZoneSsim.left}\`<br>upper-right \`${output.metrics.debrisZoneSsim.upperRight}\`<br>lower-right \`${output.metrics.debrisZoneSsim.lowerRight}\`<br>debris change avg \`${output.metrics.debrisZoneChangeAverage}\`<br>triage \`${output.metrics.triageScore}\`` : `metrics failed: ${output.metricsError}`} | ${output.reviewBoardStatus === 'generated' ? `\`${output.reviewBoardPath}\`` : `review board failed: ${output.reviewBoardError}`} | ${output.comparisonStatus === 'generated' ? `\`${output.comparisonPath}\`` : `comparison failed: ${output.comparisonError}`} | ${output.debrisFocusStatus === 'generated' ? `\`${output.debrisFocusComparisonPath}\`` : `debris-focus failed: ${output.debrisFocusError}`} | ${output.diffComparisonStatus === 'generated' ? `\`${output.diffComparisonPath}\`` : `diff failed: ${output.diffComparisonError}`} | ${output.reviewBoardStatus === 'generated' ? `\`start "" "${output.reviewBoardFilesystemPath}"\`<br>` : ''}\`start "" "${output.filesystemPath}"\`<br>\`start "" "${output.comparisonFilesystemPath}"\`<br>\`start "" "${output.debrisFocusComparisonFilesystemPath}"\`<br>\`start "" "${output.diffComparisonFilesystemPath}"\` | \`${output.promoteCommand}\` |`),
    '',
    '### Acceptance checklist',
    '',
    '- [ ] Compare each candidate against the contaminated reference still and reject any option that still contains paper-like debris, flyers, slips, bills, or rectangular scrap shapes.',
    '- [ ] Use the debris-focus crop sheet to inspect the left edge, upper-right edge, and lower-right foreground where paper-like scraps have repeatedly survived earlier passes.',
    '- [ ] Use the diff image to spot subtle surviving debris or identity/framing drift faster before trusting a candidate that otherwise looks close to the reference.',
    '- [ ] Reject any candidate that drifts too far from the approved creature identity, anatomy, framing, or environment.',
    '- [ ] Pick exactly one still candidate to promote as the cleaned anchor before rerendering loops again.',
    '- [ ] Run the listed `promote:still` command for the chosen candidate so the canonical still and follow-up rerender handoff are updated together.',
    '- [ ] After choosing the still, rerun the affected loop (`loop-b`) from that approved cleaned anchor and repeat debris + seamless-loop review.',
    '',
  ]),
];

await fs.writeFile(reviewMdPath, `${mdLines.join('\n')}\n`);

const htmlLines = [
  '<!doctype html>',
  '<html lang="en">',
  '<head>',
  '  <meta charset="utf-8" />',
  '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
  '  <title>Still candidate review</title>',
  '  <style>',
  '    :root { color-scheme: dark; }',
  '    body { font-family: Inter, Segoe UI, Arial, sans-serif; margin: 24px; background: #0b1020; color: #e8ecf3; }',
  '    h1, h2, h3, p { margin: 0 0 12px; }',
  '    .meta { color: #aab6cc; margin-bottom: 24px; }',
  '    .entry { background: #121a2b; border: 1px solid #25324a; border-radius: 14px; padding: 18px; margin-bottom: 24px; }',
  '    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; margin-top: 16px; }',
  '    figure { margin: 0; background: #0f1727; border: 1px solid #2d3b57; border-radius: 12px; padding: 12px; }',
  '    img { display: block; width: 100%; height: auto; border-radius: 8px; background: #05070d; }',
  '    figcaption { margin-top: 10px; color: #cdd7e8; font-size: 13px; }',
  '    code { color: #8ee6ff; word-break: break-word; }',
  '    ul { color: #cdd7e8; }',
  '    .command { margin-top: 8px; padding: 10px 12px; border-radius: 10px; background: #0b1322; border: 1px solid #2d3b57; }',
  '  </style>',
  '</head>',
  '<body>',
  '  <h1>Still candidate review</h1>',
  `  <p class="meta">Recorded at ${escapeHtml(recordedAt)} · State filter: ${escapeHtml(selectedState ?? 'all generated still jobs')}</p>`,
  ...reviewEntries.map((entry) => {
    const referenceRelative = path.relative(path.dirname(reviewHtmlPath), resolveFromRoot(entry.referenceImage)).replace(/\\/g, '/');
    const overviewRelative = path.relative(path.dirname(reviewHtmlPath), entry.overviewFilesystemPath).replace(/\\/g, '/');
    return [
      '  <section class="entry">',
      `    <h2>${escapeHtml(entry.stateId)} · ${escapeHtml(entry.label)}</h2>`,
      `    <p><strong>Provider:</strong> <code>${escapeHtml(entry.provider)}</code> · <strong>Model:</strong> <code>${escapeHtml(entry.model)}</code></p>`,
      `    <p><strong>Canonical target:</strong> <code>${escapeHtml(entry.canonicalTarget)}</code></p>`,
      `    <p><strong>Reference still:</strong> <code>${escapeHtml(entry.referenceImage)}</code></p>`,
      `    <p><strong>Reference fingerprint:</strong> <code>${escapeHtml(entry.referenceFingerprint.sha256)}</code> · bytes <code>${escapeHtml(entry.referenceFingerprint.bytes)}</code> · modified <code>${escapeHtml(entry.referenceFingerprint.modifiedAt)}</code></p>`,
      `    <p><strong>Default loop rerender follow-up:</strong> variant <code>${escapeHtml(entry.defaultLoopVariant)}</code> · model <code>${escapeHtml(entry.defaultLoopModel)}</code> · timeout <code>${escapeHtml(entry.defaultLoopTimeoutMs)}</code></p>`,
      entry.rankedCandidates.length
        ? `    <p><strong>Automated triage ranking:</strong> ${entry.rankedCandidates.map((candidate) => `candidate <code>${escapeHtml(candidate.index)}</code> (#${escapeHtml(candidate.triageRank)}, triage <code>${escapeHtml(candidate.triageScore)}</code>, full-image SSIM <code>${escapeHtml(candidate.fullImageSsim)}</code>, debris-zone change avg <code>${escapeHtml(candidate.debrisZoneChangeAverage)}</code>)`).join(' · ')}</p>`
        : '    <p><strong>Automated triage ranking:</strong> unavailable (metrics failed for all candidates).</p>',
      entry.overviewStatus === 'generated'
        ? `    <p><strong>Overview sheet:</strong> <code>${escapeHtml(entry.overviewPath)}</code></p><div class="command"><strong>Open overview:</strong><br><code>${escapeHtml(`start "" "${entry.overviewFilesystemPath}"`)}</code></div>`
        : `    <p><strong>Overview sheet:</strong> failed · ${escapeHtml(entry.overviewError ?? 'unknown error')}</p>`,
      entry.overviewStatus === 'generated'
        ? [
          '    <figure style="margin: 16px 0 0;">',
          `      <img src="${escapeHtml(overviewRelative)}" alt="${escapeHtml(`${entry.stateId} still candidate overview sheet`)}" />`,
          `      <figcaption>Overview sheet · reference first, then candidates 1-${entry.outputs.length} · <code>${escapeHtml(entry.overviewPath)}</code></figcaption>`,
          '    </figure>',
        ].join('\n')
        : '',
      '    <div class="grid">',
      '      <figure>',
      `        <img src="${escapeHtml(referenceRelative)}" alt="${escapeHtml(`${entry.stateId} contaminated reference still`)}" />`,
      '        <figcaption>Reference still (current contaminated anchor)</figcaption>',
      '      </figure>',
      ...entry.outputs.map((output) => {
        const outputRelative = path.relative(path.dirname(reviewHtmlPath), output.filesystemPath).replace(/\\/g, '/');
        const comparisonRelative = path.relative(path.dirname(reviewHtmlPath), output.comparisonFilesystemPath).replace(/\\/g, '/');
        const debrisFocusRelative = path.relative(path.dirname(reviewHtmlPath), output.debrisFocusComparisonFilesystemPath).replace(/\\/g, '/');
        const diffComparisonRelative = path.relative(path.dirname(reviewHtmlPath), output.diffComparisonFilesystemPath).replace(/\\/g, '/');
        return [
          '      <figure>',
          `        <img src="${escapeHtml(outputRelative)}" alt="${escapeHtml(`${entry.stateId} still candidate ${output.index}`)}" />`,
          `        <figcaption>Candidate ${output.index} · <code>${escapeHtml(output.path)}</code><br>sha256 <code>${escapeHtml(output.fingerprint.sha256)}</code><br>bytes <code>${escapeHtml(output.fingerprint.bytes)}</code> · modified <code>${escapeHtml(output.fingerprint.modifiedAt)}</code>${output.metrics ? `<br>full-image SSIM <code>${escapeHtml(output.metrics.fullImageSsim)}</code> · debris-zone change avg <code>${escapeHtml(output.metrics.debrisZoneChangeAverage)}</code> · triage <code>${escapeHtml(output.metrics.triageScore)}</code><br>zone SSIMs: left <code>${escapeHtml(output.metrics.debrisZoneSsim.left)}</code> · upper-right <code>${escapeHtml(output.metrics.debrisZoneSsim.upperRight)}</code> · lower-right <code>${escapeHtml(output.metrics.debrisZoneSsim.lowerRight)}</code>` : `<br>metrics failed: ${escapeHtml(output.metricsError ?? 'unknown error')}`}</figcaption>`,
          `        <div class="command"><strong>Promote:</strong><br><code>${escapeHtml(output.promoteCommand)}</code></div>`,
          output.reviewBoardStatus === 'generated'
            ? `        <div class="command"><strong>Open single-file review board:</strong><br><code>${escapeHtml(`start "" "${output.reviewBoardFilesystemPath}"`)}</code></div>`
            : `        <div class="command"><strong>Single-file review board:</strong><br><code>${escapeHtml(output.reviewBoardError ?? 'build failed')}</code></div>`,
          '      </figure>',
          output.reviewBoardStatus === 'generated'
            ? [
              '      <figure>',
              `        <img src="${escapeHtml(path.relative(path.dirname(reviewHtmlPath), output.reviewBoardFilesystemPath).replace(/\\/g, '/'))}" alt="${escapeHtml(`${entry.stateId} still candidate ${output.index} review board`)}" />`,
              `        <figcaption>Single-file review board ${output.index} · candidate, compare, debris-focus, diff stacked top-to-bottom · <code>${escapeHtml(output.reviewBoardPath)}</code></figcaption>`,
              '      </figure>',
            ].join('\n')
            : '',
          '      <figure>',
          output.comparisonStatus === 'generated'
            ? `        <img src="${escapeHtml(comparisonRelative)}" alt="${escapeHtml(`${entry.stateId} still candidate ${output.index} comparison`)}" />`
            : '        <div style="min-height: 180px; display:flex; align-items:center; justify-content:center; border-radius:8px; background:#05070d; color:#ffb4b4; padding:12px; text-align:center;">Comparison build failed</div>',
          output.comparisonStatus === 'generated'
            ? `        <figcaption>Comparison ${output.index} · reference (left) vs candidate (right) · <code>${escapeHtml(output.comparisonPath)}</code></figcaption>`
            : `        <figcaption>Comparison ${output.index} failed · ${escapeHtml(output.comparisonError ?? 'unknown error')}</figcaption>`,
          '      </figure>',
          '      <figure>',
          output.debrisFocusStatus === 'generated'
            ? `        <img src="${escapeHtml(debrisFocusRelative)}" alt="${escapeHtml(`${entry.stateId} still candidate ${output.index} debris-focus comparison`)}" />`
            : '        <div style="min-height: 180px; display:flex; align-items:center; justify-content:center; border-radius:8px; background:#05070d; color:#ffb4b4; padding:12px; text-align:center;">Debris-focus build failed</div>',
          output.debrisFocusStatus === 'generated'
            ? `        <figcaption>Debris-focus ${output.index} · left-edge / upper-right / lower-right crops, reference left and candidate right in each row · <code>${escapeHtml(output.debrisFocusComparisonPath)}</code></figcaption>`
            : `        <figcaption>Debris-focus ${output.index} failed · ${escapeHtml(output.debrisFocusError ?? 'unknown error')}</figcaption>`,
          '      </figure>',
          '      <figure>',
          output.diffComparisonStatus === 'generated'
            ? `        <img src="${escapeHtml(diffComparisonRelative)}" alt="${escapeHtml(`${entry.stateId} still candidate ${output.index} diff comparison`)}" />`
            : '        <div style="min-height: 180px; display:flex; align-items:center; justify-content:center; border-radius:8px; background:#05070d; color:#ffb4b4; padding:12px; text-align:center;">Diff build failed</div>',
          output.diffComparisonStatus === 'generated'
            ? `        <figcaption>Diff ${output.index} · reference/candidate on top, enhanced absolute-difference heatmap below · <code>${escapeHtml(output.diffComparisonPath)}</code></figcaption>`
            : `        <figcaption>Diff ${output.index} failed · ${escapeHtml(output.diffComparisonError ?? 'unknown error')}</figcaption>`,
          '      </figure>',
        ].join('\n');
      }),
      '    </div>',
      '    <h3>Acceptance checklist</h3>',
      '    <ul>',
      '      <li>Reject any candidate that still contains paper-like debris, flyers, slips, bills, or rectangular scrap shapes.</li>',
      '      <li>Use the debris-focus crop sheet to inspect the left edge, upper-right edge, and lower-right foreground where paper-like scraps have repeatedly survived earlier passes.</li>',
      '      <li>Use the diff image to spot subtle surviving debris or identity/framing drift faster before trusting a candidate that otherwise looks close to the reference.</li>',
      '      <li>Reject any candidate that drifts too far from the approved creature identity, anatomy, framing, or environment.</li>',
      '      <li>Pick exactly one candidate to promote as the cleaned still anchor before rerendering loops again.</li>',
      '      <li>Run the listed <code>promote:still</code> command for the chosen candidate so the canonical still and follow-up rerender handoff are updated together.</li>',
      '      <li>After choosing the still, rerun the affected loop and repeat debris + seamless-loop review.</li>',
      '    </ul>',
      '  </section>',
    ].join('\n');
  }),
  '</body>',
  '</html>',
];

await fs.writeFile(reviewHtmlPath, `${htmlLines.join('\n')}\n`);

console.log(`Wrote ${relativeFromRoot(reviewJsonPath)}, ${relativeFromRoot(reviewMdPath)}, and ${relativeFromRoot(reviewHtmlPath)}.`);

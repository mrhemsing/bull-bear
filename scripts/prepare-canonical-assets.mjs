import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const root = process.cwd();
const manifestPath = path.join(root, 'data', 'state-manifest.json');
const promptsPath = path.join(root, 'data', 'state-prompts.json');
const publicStatesDir = path.join(root, 'public', 'states');
const outputDir = path.join(root, 'data', 'generated');
const outDir = path.join(root, 'out');
const anchorSelectionPath = path.join(outputDir, 'anchor-selection.json');
const loopRerenderTargetsPath = path.join(root, 'data', 'loop-rerender-targets.json');

const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
const prompts = JSON.parse(await fs.readFile(promptsPath, 'utf8'));

await fs.mkdir(publicStatesDir, { recursive: true });
await fs.mkdir(outputDir, { recursive: true });

const readJsonIfExists = async (targetPath) => {
  try {
    return JSON.parse(await fs.readFile(targetPath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
};

const listFilesIfExists = async (targetDir) => {
  try {
    const entries = await fs.readdir(targetDir, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }

    throw error;
  }
};

const writeJson = async (targetPath, value) => {
  await fs.writeFile(targetPath, `${JSON.stringify(value, null, 2)}\n`);
};

const createSanitizedStillReference = async ({ sourcePath, outputPath }) => {
  const filter = [
    '[0:v]split=8[base][leftsrc][uprsrc][lowrsrc][leftmirrorsrc][lowrmirrorsrc][uprmirrorsrc][fullsoftsrc]',
    '[leftsrc]crop=220:700:0:120,boxblur=50:20[left]',
    '[uprsrc]crop=340:280:1196:0,boxblur=50:20[upr]',
    '[lowrsrc]crop=440:300:1096:724,boxblur=50:20[lowr]',
    '[leftmirrorsrc]crop=220:700:220:120,hflip[leftmirror]',
    '[lowrmirrorsrc]crop=440:300:656:724,hflip[lowrmirror]',
    '[uprmirrorsrc]crop=340:280:856:0,hflip[uprmirror]',
    '[fullsoftsrc]boxblur=12:4[fullsoft]',
    '[base][leftmirror]overlay=0:120[tmp0]',
    '[tmp0][left]overlay=0:120[tmp1]',
    '[tmp1][uprmirror]overlay=1196:0[tmp2]',
    '[tmp2][upr]overlay=1196:0[tmp3]',
    '[tmp3][lowrmirror]overlay=1096:724[tmp4]',
    '[tmp4][lowr]overlay=1096:724[tmp5]',
    '[tmp5][fullsoft]blend=all_mode=normal:all_opacity=0.08[out]'
  ].join(';');

  await execFileAsync('ffmpeg', [
    '-y',
    '-i', sourcePath,
    '-filter_complex', filter,
    '-map', '[out]',
    outputPath,
  ]);
};

const anchorSelection = await readJsonIfExists(anchorSelectionPath);
const previousChecklist = await readJsonIfExists(path.join(outputDir, 'canonical-asset-checklist.json'));
const previousReviewQueue = await readJsonIfExists(path.join(outputDir, 'canonical-review-queue.json'));
const configuredLoopRerenderTargets = await readJsonIfExists(loopRerenderTargetsPath);
const forceAllStillRenders = process.argv.includes('--force-still-regeneration');
const forceStillStatesArg = process.argv.find((arg) => arg.startsWith('--force-still-states='));
const stillModelArg = process.argv.find((arg) => arg.startsWith('--still-model='));
const stillCountArg = process.argv.find((arg) => arg.startsWith('--still-count='));
const configuredStillCount = Math.max(
  1,
  Number.parseInt(
    stillCountArg?.split('=')[1]?.trim()
      || process.env.STILL_IMAGE_COUNT?.trim()
      || '3',
    10,
  ) || 3,
);
const configuredStillModel = stillModelArg
  ? stillModelArg.split('=')[1].trim()
  : process.env.STILL_IMAGE_MODEL?.trim() || process.env.OPENAI_IMAGE_MODEL?.trim() || 'openai/gpt-image-1';
const configuredStillProvider = configuredStillModel.startsWith('fal-ai/') || configuredStillModel.startsWith('fal/')
  ? 'fal.ai'
  : configuredStillModel.startsWith('openai/')
    ? 'openai-images-edits'
    : 'openclaw-image-generate';
const forceStillStates = new Set(
  forceStillStatesArg
    ? forceStillStatesArg
        .split('=')[1]
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
    : []
);
const forceAllLoopRenders = process.argv.includes('--force-loop-regeneration');
const forceLoopStatesArg = process.argv.find((arg) => arg.startsWith('--force-loop-states='));
const configuredLoopRerenderStateIds = new Set(
  Array.isArray(configuredLoopRerenderTargets?.states)
    ? configuredLoopRerenderTargets.states
        .map((value) => typeof value === 'string' ? value.trim() : '')
        .filter(Boolean)
    : []
);
const forceLoopStates = new Set(
  [
    ...configuredLoopRerenderStateIds,
    ...(forceLoopStatesArg
      ? forceLoopStatesArg
          .split('=')[1]
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean)
      : [])
  ]
);
const shouldForceStillRegeneration = (stateId) => forceAllStillRenders || forceStillStates.has(stateId);
const shouldForceLoopRegeneration = (stateId) => forceAllLoopRenders || forceLoopStates.has(stateId);
const checklist = [];
const batch = [];
const review = [];
const loopQueue = [];
const stillQueue = [];
const stillRenderJobs = [];
const loopRenderJobs = [];
const stagedRenderHandoff = [];
const imageGenerationJobs = [];
let approvedLoopCount = 0;
let readyLoopCount = 0;

const buildNextActions = () => {
  const actions = [];

  for (const item of loopQueue) {
    actions.push({
      type: 'generate-loop',
      priority: item.priorityGroup === 'forced-regeneration' ? 1 : 3,
      stateId: item.stateId,
      stateIndex: item.stateIndex,
      label: item.label,
      title: `Generate loop ${item.variant.toUpperCase()} for ${item.label}`,
      target: item.loopTarget,
      source: item.stillSource,
      referenceStateId: null,
      referenceStillTarget: item.stillTarget,
      prompt: item.prompt,
      notes: item.notes,
    });
  }

  for (const item of stillQueue) {
    actions.push({
      type: 'generate-still',
      priority: item.priorityGroup === 'forced-regeneration' ? 2 : 4,
      stateId: item.stateId,
      stateIndex: item.stateIndex,
      label: item.label,
      title: `Generate frontier still batch for ${item.label}`,
      target: item.stillTarget,
      source: item.outputDir,
      referenceStateId: item.referenceStateId,
      referenceStillTarget: item.referenceStillTarget,
      prompt: item.prompt,
      notes: item.notes,
    });
  }

  return actions.sort((a, b) => a.priority - b.priority || a.stateIndex - b.stateIndex || a.title.localeCompare(b.title));
};

const approvedStateIndexes = new Set();
for (const state of manifest) {
  const canonicalStillRelativePath = state.still.replace(/^\//, 'public/').replace(/\//g, path.sep);
  const canonicalStillAbsolutePath = path.join(root, canonicalStillRelativePath);

  try {
    await fs.access(canonicalStillAbsolutePath);
    approvedStateIndexes.add(state.index);
  } catch {
    // noop
  }
}

const contiguousSeed = anchorSelection?.selectedNeutralAnchor?.state ?? manifest.find((state) => approvedStateIndexes.has(state.index))?.index ?? null;
let contiguousRange = null;
if (contiguousSeed && approvedStateIndexes.has(contiguousSeed)) {
  let start = contiguousSeed;
  let end = contiguousSeed;

  while (approvedStateIndexes.has(start - 1)) start -= 1;
  while (approvedStateIndexes.has(end + 1)) end += 1;

  contiguousRange = { start, end };
}

for (const state of manifest) {
  const promptEntry = prompts.find((entry) => entry.id === state.id);
  if (!promptEntry) {
    throw new Error(`Missing prompt entry for ${state.id}`);
  }

  const importPlaceholderDir = path.join(outDir, 'imported-state-placeholders');
  await fs.mkdir(importPlaceholderDir, { recursive: true });

  const stateKey = String(state.index).padStart(2, '0');
  const placeholderFiles = [
    { runtimeName: `${stateKey}.png`, note: 'Drop approved still image here.' },
    { runtimeName: `${stateKey}-a.mp4`, note: 'Drop approved loop A here.' },
    { runtimeName: `${stateKey}-b.mp4`, note: 'Drop approved loop B here.' },
    { runtimeName: `${stateKey}-c.mp4`, note: 'Drop approved loop C here.' }
  ];

  for (const file of placeholderFiles) {
    const target = path.join(importPlaceholderDir, `${file.runtimeName}.placeholder.txt`);
    const content = `${state.id} / ${state.label}\n${file.note}\nExpected runtime path: /states/${file.runtimeName}\nExpected filesystem target: public/states/${file.runtimeName}\n`;
    await fs.writeFile(target, content, 'utf8');
  }

  const adjacentDirName = `${state.id}-adjacent`;
  const adjacentDir = path.join(outDir, adjacentDirName);
  const adjacentManifest = await readJsonIfExists(path.join(adjacentDir, 'manifest.json'));
  const adjacentFiles = (await listFilesIfExists(adjacentDir)).filter((file) => file !== 'manifest.json');
  const canonicalStillRelativePath = state.still.replace(/^\//, 'public/').replace(/\//g, path.sep);
  const canonicalStillAbsolutePath = path.join(root, canonicalStillRelativePath);

  let canonicalStillExists = false;
  try {
    await fs.access(canonicalStillAbsolutePath);
    canonicalStillExists = true;
  } catch {
    canonicalStillExists = false;
  }

  const previousChecklistEntry = previousChecklist?.find((entry) => entry.id === state.id) ?? null;
  const previousReviewEntry = previousReviewQueue?.find((entry) => entry.stateId === state.id) ?? null;

  const selectedAnchor = anchorSelection?.selectedNeutralAnchor?.state === state.index
    ? anchorSelection.selectedNeutralAnchor
    : null;

  const approvedAdjacentSelection = !selectedAnchor && canonicalStillExists
    ? previousChecklistEntry?.still?.selectedAnchor
      ? {
          sourceFile: previousChecklistEntry.still.selectedAnchor.sourceFile,
          canonicalTarget: previousChecklistEntry.still.selectedAnchor.canonicalTarget,
          notes: previousChecklistEntry.still.selectedAnchor.notes ?? 'Approved adjacent winner retained from previous generated checklist.'
        }
      : previousReviewEntry?.selectedFile
        ? {
            sourceFile: `${previousReviewEntry.sourceDir}/${previousReviewEntry.selectedFile}`.replace(/\\/g, '/'),
            canonicalTarget: canonicalStillRelativePath.replace(/\\/g, '/'),
            notes: previousReviewEntry.notes ?? 'Approved adjacent winner retained from previous review queue.'
          }
        : {
            sourceFile: canonicalStillRelativePath.replace(/\\/g, '/'),
            canonicalTarget: canonicalStillRelativePath.replace(/\\/g, '/'),
            notes: 'Approved still detected in canonical public asset path.'
          }
    : null;

  const forceStillRegeneration = shouldForceStillRegeneration(state.id);
  const selectedStill = forceStillRegeneration ? null : (selectedAnchor ?? approvedAdjacentSelection);

  if (canonicalStillExists && forceStillRegeneration) {
    const outputDirRelative = `out/${state.id}-still-regeneration`;
    const renderDirAbsolute = path.join(root, outputDirRelative.replace(/\//g, path.sep));
    await fs.mkdir(renderDirAbsolute, { recursive: true });

    const renderPrompt = [
      `Create a cleaned replacement canonical still for Bull Bear ${state.id} (${state.label}) using the provided current canonical still as the exact identity anchor.`,
      'Preserve the same recurring hybrid bull-bear titan, same anatomy, same species, same centered low-angle hero framing, same Wall Street destruction environment, and the same premium photoreal dark-fantasy finish.',
      `Target state prompt: ${promptEntry.stillPrompt}`,
      'Remove any floating paper scraps, banknotes, bills, flyers, tickets, posters, receipts, notes, cards, confetti, leaflets, wrappers, or other detached rectangular debris from the image.',
      'Do not show any loose rectangles, flat scraps, sheet-like fragments, or paper-like shapes in the air, on the ground, at the frame edges, or partially hidden in smoke/haze. Do not add drifting litter, airborne fragments, foreground scraps, or edge clutter of any kind.',
      'Keep the atmosphere clean and simple: smoke, atmospheric haze, ember grit, dust, sparks, shadow, rubble, and grounded debris masses only. If a detail could read as a detached paper-like object, omit it and leave that area as haze, smoke, or shadow instead.',
      'No text, no logos, no collage, no extra creatures, no costume changes, and no radical camera change.'
    ].join(' ');

    const canonicalStillReferenceFilename = `${state.id}-still-reference${path.extname(state.still) || '.png'}`;
    const canonicalStillReferenceRelativePath = `${outputDirRelative}/${canonicalStillReferenceFilename}`;
    const canonicalStillReferenceAbsolutePath = path.join(renderDirAbsolute, canonicalStillReferenceFilename);
    const sanitizedStillReferenceFilename = `${state.id}-still-reference-scrubbed${path.extname(state.still) || '.png'}`;
    const sanitizedStillReferenceRelativePath = `${outputDirRelative}/${sanitizedStillReferenceFilename}`;
    const sanitizedStillReferenceAbsolutePath = path.join(renderDirAbsolute, sanitizedStillReferenceFilename);

    try {
      await fs.copyFile(canonicalStillAbsolutePath, canonicalStillReferenceAbsolutePath);
      await createSanitizedStillReference({
        sourcePath: canonicalStillReferenceAbsolutePath,
        outputPath: sanitizedStillReferenceAbsolutePath,
      });
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    const forcedStillSuggestedOutputs = Array.from({ length: configuredStillCount }, (_, index) => `${state.id}-still-regeneration-${String(index + 1).padStart(2, '0')}.png`);

    const renderManifest = {
      stateId: state.id,
      stateIndex: state.index,
      label: state.label,
      direction: 'forced-regeneration',
      stillTarget: state.still,
      outputDir: outputDirRelative,
      referenceStateId: state.id,
      referenceStateLabel: state.label,
      referenceStillTarget: state.still,
      referenceStillSource: canonicalStillRelativePath.replace(/\\/g, '/'),
      bridgeReferenceCopy: canonicalStillReferenceRelativePath,
      sanitizedBridgeReferenceCopy: sanitizedStillReferenceRelativePath,
      prompt: promptEntry.stillPrompt,
      renderPrompt,
      suggestedOutputs: forcedStillSuggestedOutputs,
      notes: `Regenerate canonical still candidates for ${state.label} because the approved still contains paper-like debris that contaminates loop rerenders.`
    };

    const renderManifestPath = path.join(renderDirAbsolute, 'render-manifest.json');
    const renderPromptPath = path.join(renderDirAbsolute, 'render-prompt.txt');

    await writeJson(renderManifestPath, renderManifest);
    await fs.writeFile(renderPromptPath, `${renderPrompt}\n`, 'utf8');
    stillRenderJobs.push(renderManifest);

    const imageGenerationJob = {
      stateId: state.id,
      stateIndex: state.index,
      label: state.label,
      provider: configuredStillProvider,
      mode: 'edit',
      model: configuredStillModel,
      image: sanitizedStillReferenceRelativePath,
      originalReferenceImage: canonicalStillReferenceRelativePath,
      prompt: renderPrompt,
      count: configuredStillCount,
      size: '1536x1024',
      falOverrides: configuredStillProvider === 'fal.ai'
        ? {
            guidanceScale: 7,
            numInferenceSteps: 50,
            strength: 0.9,
          }
        : undefined,
      outputDir: outputDirRelative,
      canonicalTarget: state.still,
      suggestedOutputs: renderManifest.suggestedOutputs,
      renderManifestPath: path.relative(root, renderManifestPath).replace(/\\/g, '/'),
      renderPromptPath: path.relative(root, renderPromptPath).replace(/\\/g, '/'),
      notes: 'Provider-ready still image-edit request for replacing a contaminated approved canonical still with stricter deviation from a scrubbed identity anchor that removes the known debris zones before generation.'
    };

    imageGenerationJobs.push(imageGenerationJob);
    stillQueue.push({
      stateId: state.id,
      stateIndex: state.index,
      label: state.label,
      direction: 'forced-regeneration',
      prompt: promptEntry.stillPrompt,
      stillTarget: state.still,
      outputDir: outputDirRelative,
      referenceStateId: state.id,
      referenceStillTarget: state.still,
      priorityGroup: 'forced-regeneration',
      notes: `Regenerate canonical still candidates for ${state.label} because the approved still contains paper-like debris that contaminates loop rerenders.`
    });

    stagedRenderHandoff.push({
      type: 'still',
      priority: 1,
      stateId: state.id,
      stateIndex: state.index,
      label: state.label,
      variant: null,
      target: state.still,
      outputDir: outputDirRelative,
      renderDir: outputDirRelative,
      renderManifestPath: path.relative(root, renderManifestPath).replace(/\\/g, '/'),
      renderPromptPath: path.relative(root, renderPromptPath).replace(/\\/g, '/'),
      referenceStateId: state.id,
      referenceStillSource: canonicalStillRelativePath.replace(/\\/g, '/'),
      referenceCopy: canonicalStillReferenceRelativePath,
      sanitizedReferenceCopy: sanitizedStillReferenceRelativePath,
      notes: `Regenerate canonical still candidates for ${state.label} because the approved still contains paper-like debris that contaminates loop rerenders.`
    });
  }

  const loopEntries = await Promise.all(state.loops.map(async (loopPath, index) => {
    const canonicalLoopRelativePath = loopPath.replace(/^\//, 'public/').replace(/\//g, path.sep);
    const canonicalLoopAbsolutePath = path.join(root, canonicalLoopRelativePath);

    let canonicalLoopExists = false;
    try {
      await fs.access(canonicalLoopAbsolutePath);
      canonicalLoopExists = true;
    } catch {
      canonicalLoopExists = false;
    }

    const variant = ['a', 'b', 'c'][index];
    const prompt = `${promptEntry.animationBasePrompt} ${promptEntry.loopPrompts[variant]}`;
    const forceLoopRegeneration = shouldForceLoopRegeneration(state.id);
    const status = canonicalLoopExists
      ? forceLoopRegeneration
        ? 'approved-needs-rerender'
        : 'approved'
      : selectedStill
        ? 'ready-to-generate'
        : 'blocked-until-still-approved';

    if (canonicalLoopExists) {
      approvedLoopCount += 1;
    }

    if (selectedStill && (!canonicalLoopExists || forceLoopRegeneration)) {
      readyLoopCount += 1;
      loopQueue.push({
        stateId: state.id,
        stateIndex: state.index,
        label: state.label,
        variant,
        prompt,
        stillSource: selectedStill.sourceFile,
        stillTarget: state.still,
        loopTarget: loopPath,
        priorityGroup: forceLoopRegeneration ? 'forced-regeneration' : 'contiguous-approved-run',
        notes: forceLoopRegeneration
          ? `Regenerate ${variant.toUpperCase()} loop for ${state.label} because the canonical animation prompt changed and the approved runtime loop needs replacement.`
          : `Generate ${variant.toUpperCase()} loop for approved ${selectedAnchor ? 'anchor' : 'adjacent'} still.`
      });
    }

    return {
      target: loopPath,
      prompt,
      status,
      exists: canonicalLoopExists,
      reviewSource: canonicalLoopExists ? canonicalLoopRelativePath.replace(/\\/g, '/') : null
    };
  }));

  const stillStatus = selectedAnchor
    ? `approved anchor selected (${path.basename(selectedAnchor.sourceFile)})`
    : forceStillRegeneration
      ? 'approved-needs-regeneration'
    : approvedAdjacentSelection
      ? `approved adjacent winner (${path.basename(approvedAdjacentSelection.sourceFile)})`
      : adjacentFiles.length > 0
        ? `candidate batch generated (${path.relative(root, adjacentDir).replace(/\\/g, '/')}/)`
        : canonicalStillExists
          ? 'approved still detected in canonical path'
          : 'pending';

  checklist.push({
    id: state.id,
    index: state.index,
    label: state.label,
    still: {
      target: state.still,
      prompt: promptEntry.stillPrompt,
      status: stillStatus,
      reviewSource: selectedAnchor
        ? selectedAnchor.sourceFile
        : approvedAdjacentSelection
          ? approvedAdjacentSelection.sourceFile
          : adjacentFiles.length > 0
            ? path.relative(root, adjacentDir).replace(/\\/g, '/')
            : canonicalStillExists
              ? canonicalStillRelativePath.replace(/\\/g, '/')
              : null,
      selectedAnchor: selectedStill
        ? {
            sourceFile: selectedStill.sourceFile,
            canonicalTarget: selectedStill.canonicalTarget,
            notes: selectedStill.notes ?? null
          }
        : null,
      candidateFiles: selectedStill ? [] : adjacentFiles
    },
    loops: loopEntries
  });

  batch.push({
    stateId: state.id,
    label: state.label,
    stillPrompt: promptEntry.stillPrompt,
    stillTarget: state.still,
    animationBasePrompt: promptEntry.animationBasePrompt,
    loopPrompts: promptEntry.loopPrompts,
    loopTargets: state.loops
  });

  if (selectedAnchor || approvedAdjacentSelection || adjacentFiles.length > 0) {
    const needsLoopRerender = shouldForceLoopRegeneration(state.id);
    review.push({
      stateId: state.id,
      label: state.label,
      reviewType: selectedAnchor
        ? 'approved-anchor'
        : approvedAdjacentSelection
          ? needsLoopRerender
            ? 'approved-adjacent-needs-rerender'
            : 'approved-adjacent'
          : 'adjacent-candidates',
      sourceDir: selectedStill
        ? path.dirname(selectedStill.sourceFile)
        : path.relative(root, adjacentDir).replace(/\\/g, '/'),
      selectedFile: selectedStill ? path.basename(selectedStill.sourceFile) : null,
      candidateFiles: selectedStill
        ? [path.basename(selectedStill.sourceFile)]
        : adjacentManifest?.map((entry) => entry.file) ?? adjacentFiles,
      loopRegenerationRequired: needsLoopRerender,
      notes: needsLoopRerender
        ? `${selectedStill?.notes ?? `Approved still is usable, but the loop set must be regenerated before this state is review-complete.`}`
        : selectedStill?.notes ?? null
    });
  }
}

if (contiguousRange) {
  const frontierIndexes = [contiguousRange.start - 1, contiguousRange.end + 1].filter((index) => index >= 1 && index <= manifest.length);

  for (const index of frontierIndexes) {
    const state = manifest.find((entry) => entry.index === index);
    if (!state || approvedStateIndexes.has(index)) continue;

    const promptEntry = prompts.find((entry) => entry.id === state.id);
    if (!promptEntry) {
      throw new Error(`Missing prompt entry for ${state.id}`);
    }

    const neighborIndex = index < contiguousRange.start ? index + 1 : index - 1;
    const neighborState = manifest.find((entry) => entry.index === neighborIndex);
    const outputDirRelative = `out/${state.id}-adjacent`;
    const referenceStillSource = neighborState?.still ? path.join(root, neighborState.still.replace(/^\//, 'public/').replace(/\//g, path.sep)) : null;

    stillQueue.push({
      stateId: state.id,
      stateIndex: state.index,
      label: state.label,
      direction: index < contiguousRange.start ? 'bearish-expansion' : 'bullish-expansion',
      prompt: promptEntry.stillPrompt,
      stillTarget: state.still,
      outputDir: outputDirRelative,
      referenceStateId: neighborState?.id ?? null,
      referenceStillTarget: neighborState?.still ?? null,
      priorityGroup: 'frontier-adjacent-generation',
      notes: `Generate the next outward adjacent still batch for ${state.label} using the locked contiguous neighbor as the identity bridge.`
    });

    const renderDirAbsolute = path.join(root, outputDirRelative.replace(/\//g, path.sep));
    await fs.mkdir(renderDirAbsolute, { recursive: true });

    const renderPrompt = [
      `Create a new adjacent canonical still for Bull Bear ${state.id} (${state.label}) using the provided reference image as the immediate neighboring approved state identity bridge.`,
      'Preserve the same recurring hybrid bull-bear titan, same species, same face/fur/horn/skull/body DNA, same centered low-angle hero composition, same cinematic Wall Street destruction setting, same premium photoreal dark-fantasy realism, and same production consistency.',
      `Target state prompt: ${promptEntry.stillPrompt}`,
      `Reference state: ${neighborState?.id ?? 'unknown'}${neighborState ? ` (${neighborState.label})` : ''}.`,
      'Shift only one state outward from the reference while keeping the creature unmistakably the same recurring character.',
      'No text, no logo, no collage, no extra creatures, no costume changes, and no radical camera change.'
    ].join(' ');

    const bridgeReferenceFilename = neighborState?.id ? `${neighborState.id}-bridge-reference${path.extname(neighborState.still) || '.png'}` : null;
    const bridgeReferenceRelativePath = bridgeReferenceFilename ? `${outputDirRelative}/${bridgeReferenceFilename}` : null;
    const bridgeReferenceAbsolutePath = bridgeReferenceFilename ? path.join(renderDirAbsolute, bridgeReferenceFilename) : null;

    if (referenceStillSource && bridgeReferenceAbsolutePath) {
      try {
        await fs.copyFile(referenceStillSource, bridgeReferenceAbsolutePath);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }
    }

    const renderManifest = {
      stateId: state.id,
      stateIndex: state.index,
      label: state.label,
      direction: index < contiguousRange.start ? 'bearish-expansion' : 'bullish-expansion',
      stillTarget: state.still,
      outputDir: outputDirRelative,
      referenceStateId: neighborState?.id ?? null,
      referenceStateLabel: neighborState?.label ?? null,
      referenceStillTarget: neighborState?.still ?? null,
      referenceStillSource: referenceStillSource ? path.relative(root, referenceStillSource).replace(/\\/g, '/') : null,
      bridgeReferenceCopy: bridgeReferenceRelativePath,
      prompt: promptEntry.stillPrompt,
      renderPrompt,
      suggestedOutputs: [1, 2, 3].map((variant) => `${state.id}-adjacent-${String(variant).padStart(2, '0')}.png`),
      notes: `Generate the next outward adjacent still batch for ${state.label} using the locked contiguous neighbor as the identity bridge.`
    };

    const renderManifestPath = path.join(renderDirAbsolute, 'render-manifest.json');
    const renderPromptPath = path.join(renderDirAbsolute, 'render-prompt.txt');

    await writeJson(renderManifestPath, renderManifest);
    await fs.writeFile(renderPromptPath, `${renderPrompt}\n`, 'utf8');
    stillRenderJobs.push(renderManifest);

    const imageGenerationJob = {
      stateId: state.id,
      stateIndex: state.index,
      label: state.label,
      provider: configuredStillProvider,
      mode: 'edit',
      model: configuredStillModel,
      image: bridgeReferenceRelativePath,
      prompt: renderPrompt,
      count: 3,
      size: '1536x1024',
      outputDir: outputDirRelative,
      canonicalTarget: state.still,
      suggestedOutputs: renderManifest.suggestedOutputs,
      renderManifestPath: path.relative(root, renderManifestPath).replace(/\\/g, '/'),
      renderPromptPath: path.relative(root, renderPromptPath).replace(/\\/g, '/'),
      notes: 'Provider-ready still image-edit request for the next outward adjacent state batch.'
    };

    imageGenerationJobs.push(imageGenerationJob);
    stagedRenderHandoff.push({
      type: 'still',
      priority: 1,
      stateId: state.id,
      stateIndex: state.index,
      label: state.label,
      variant: null,
      target: state.still,
      outputDir: outputDirRelative,
      renderDir: outputDirRelative,
      renderManifestPath: path.relative(root, renderManifestPath).replace(/\\/g, '/'),
      renderPromptPath: path.relative(root, renderPromptPath).replace(/\\/g, '/'),
      referenceStateId: neighborState?.id ?? null,
      referenceStillSource: referenceStillSource ? path.relative(root, referenceStillSource).replace(/\\/g, '/') : null,
      referenceCopy: bridgeReferenceRelativePath,
      notes: `Generate the next outward adjacent still batch for ${state.label} using the locked contiguous neighbor as the identity bridge.`
    });
  }
}

for (const item of loopQueue) {
  const loopTargetRelative = item.loopTarget.replace(/^\//, 'public/').replace(/\//g, path.sep);
  const renderDirRelative = path.join('out', 'loop-renders', `${item.stateId}-loop-${item.variant}`).replace(/\\/g, '/');
  const renderDirAbsolute = path.join(root, renderDirRelative.replace(/\//g, path.sep));
  await fs.mkdir(renderDirAbsolute, { recursive: true });

  const stillReferenceFilename = `${item.stateId}-still-reference${path.extname(item.stillSource) || '.png'}`;
  const stillReferenceRelativePath = `${renderDirRelative}/${stillReferenceFilename}`;
  const stillReferenceAbsolutePath = path.join(renderDirAbsolute, stillReferenceFilename);
  const stillSourceAbsolutePath = path.join(root, item.stillSource.replace(/\//g, path.sep));

  try {
    await fs.copyFile(stillSourceAbsolutePath, stillReferenceAbsolutePath);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  const seamPriorityPrompt = item.stateId === 'state-20' && item.variant === 'b'
    ? [
        'Seam-critical variant instructions: this loop must land back on the opening frame composition with no visible restart snap.',
        'Treat the first frame as the final frame target as well: same creature pose, same head angle, same foreleg placement, same torso height, same camera position, and same background alignment at both ends of the clip.',
        'Use an almost-still hero hold. Allow only ultra-low-amplitude cyclic motion that can return perfectly to the start state: tiny breathing, ember shimmer, faint haze drift, and minimal lighting pulse only.',
        'Do not step, lunge, crouch, lean, weight-shift, nod, turn the head, open or close the mouth noticeably, move the forelegs, change torso height, drift the camera, change perspective, or alter the background alignment.',
        'If there is any tradeoff between liveliness and seam continuity, choose seam continuity. The loop should feel restrained, premium, and nearly static so it can repeat forever without the viewer noticing the cut.'
      ].join(' ')
    : null;

  const renderPrompt = [
    `Create a premium loop render for Bull Bear ${item.stateId} (${item.label}), variant ${item.variant.toUpperCase()}, using the provided still reference as the exact identity anchor.`,
    'Preserve the exact same recurring hybrid bull-bear titan, the same anatomy, the same creature identity, the same centered low-angle hero framing, the same Wall Street destruction environment, and the same photoreal dark-fantasy finish from the source still.',
    'This should feel like a subtle 3 to 5 second seamless cinematic loop with no scene cuts, no extra subjects, no text, no logos, no anatomy drift, and no major camera movement.',
    'Do not introduce floating paper scraps, banknotes, flyers, confetti, tickets, posters, or any other rectangular debris; keep the atmosphere limited to smoke, haze, ember grit, lighting flicker, and creature motion only.',
    ...(seamPriorityPrompt ? [seamPriorityPrompt] : []),
    `Loop prompt: ${item.prompt}`,
    `Render target: ${item.loopTarget}.`,
    'Keep motion restrained, premium, and loopable so the runtime can rotate variants without breaking continuity.'
  ].join(' ');

  const renderManifest = {
    stateId: item.stateId,
    stateIndex: item.stateIndex,
    label: item.label,
    variant: item.variant,
    stillSource: item.stillSource,
    stillTarget: item.stillTarget,
    loopTarget: item.loopTarget,
    renderDir: renderDirRelative,
    loopTargetPublicPath: item.loopTarget,
    loopTargetFilesystemPath: loopTargetRelative.replace(/\\/g, '/'),
    stillReferenceCopy: stillReferenceRelativePath,
    prompt: item.prompt,
    renderPrompt,
    notes: item.notes,
  };

  const renderManifestPath = path.join(renderDirAbsolute, 'render-manifest.json');
  const renderPromptPath = path.join(renderDirAbsolute, 'render-prompt.txt');

  await writeJson(renderManifestPath, renderManifest);
  await fs.writeFile(renderPromptPath, `${renderPrompt}\n`, 'utf8');
  loopRenderJobs.push(renderManifest);
  stagedRenderHandoff.push({
    type: 'loop',
    priority: 2,
    stateId: item.stateId,
    stateIndex: item.stateIndex,
    label: item.label,
    variant: item.variant,
    target: item.loopTarget,
    outputDir: renderDirRelative,
    renderDir: renderDirRelative,
    renderManifestPath: path.relative(root, renderManifestPath).replace(/\\/g, '/'),
    renderPromptPath: path.relative(root, renderPromptPath).replace(/\\/g, '/'),
    referenceStateId: item.stateId,
    referenceStillSource: item.stillSource,
    referenceCopy: stillReferenceRelativePath,
    notes: item.notes,
  });
}

loopQueue.sort((a, b) => a.stateIndex - b.stateIndex || a.variant.localeCompare(b.variant));
stillQueue.sort((a, b) => a.stateIndex - b.stateIndex);
loopRenderJobs.sort((a, b) => a.stateIndex - b.stateIndex || a.variant.localeCompare(b.variant));
stagedRenderHandoff.sort((a, b) => a.priority - b.priority || a.stateIndex - b.stateIndex || String(a.variant ?? '').localeCompare(String(b.variant ?? '')));

const visibleStillQueue = stillQueue;
const visibleLoopQueue = loopQueue;
const visibleStillRenderJobs = stillRenderJobs;
const visibleLoopRenderJobs = loopRenderJobs;
const visibleStagedRenderHandoff = stagedRenderHandoff;
const visibleImageGenerationJobs = imageGenerationJobs;
const visibleReadyLoopCount = visibleLoopQueue.length;

await writeJson(path.join(outputDir, 'canonical-asset-checklist.json'), checklist);
await writeJson(path.join(outputDir, 'canonical-asset-batch.json'), batch);
const nextActions = buildNextActions();

await writeJson(path.join(outputDir, 'canonical-review-queue.json'), review);
await writeJson(path.join(outputDir, 'canonical-loop-generation-queue.json'), visibleLoopQueue);
await writeJson(path.join(outputDir, 'canonical-still-generation-queue.json'), visibleStillQueue);
await writeJson(path.join(outputDir, 'canonical-still-render-jobs.json'), visibleStillRenderJobs);
await writeJson(path.join(outputDir, 'canonical-loop-render-jobs.json'), visibleLoopRenderJobs);
await writeJson(path.join(outputDir, 'canonical-staged-render-handoff.json'), visibleStagedRenderHandoff);
await writeJson(path.join(outputDir, 'canonical-image-generation-jobs.json'), visibleImageGenerationJobs);
await writeJson(path.join(outputDir, 'canonical-production-next-actions.json'), nextActions);

const markdown = [
  '# Canonical asset production checklist',
  '',
  'Generated by `npm run assets:prepare`.',
  '',
  `Approved loops detected: ${approvedLoopCount}`,
  `Loop targets ready to generate: ${visibleReadyLoopCount}`,
  '',
  '| State | Label | Still | Loop A | Loop B | Loop C |',
  '| --- | --- | --- | --- | --- | --- |'
];

for (const state of checklist) {
  markdown.push(`| ${String(state.index).padStart(2, '0')} | ${state.label} | ${state.still.status} | ${state.loops[0].status} | ${state.loops[1].status} | ${state.loops[2].status} |`);
}

const loopQueueMarkdown = [
  '# Canonical loop generation queue',
  '',
  'Generated by `npm run assets:prepare`.',
  '',
  `Ready loop targets: ${visibleLoopQueue.length}`,
  '',
  '| State | Label | Variant | Still source | Loop target | Notes |',
  '| --- | --- | --- | --- | --- | --- |'
];

const stillQueueMarkdown = [
  '# Canonical still generation queue',
  '',
  'Generated by `npm run assets:prepare`.',
  '',
  `Ready frontier still states: ${visibleStillQueue.length}`,
  '',
  '| State | Label | Direction | Reference state | Output dir | Notes |',
  '| --- | --- | --- | --- | --- | --- |'
];

const imageGenerationMarkdown = [
  '# Canonical image generation jobs',
  '',
  'Generated by `npm run assets:prepare`.',
  '',
  `Provider-ready still image-edit jobs: ${visibleImageGenerationJobs.length}`,
  '',
  '| State | Label | Model | Reference image | Original reference | Output dir | Canonical target | Suggested outputs |',
  '| --- | --- | --- | --- | --- | --- | --- | --- |'
];

const stillRenderJobsMarkdown = [
  '# Canonical still render jobs',
  '',
  'Generated by `npm run assets:prepare`.',
  '',
  `Frontier render jobs: ${visibleStillRenderJobs.length}`,
  '',
  '| State | Label | Direction | Reference state | Bridge reference copy | Scrubbed reference copy | Output dir |',
  '| --- | --- | --- | --- | --- | --- | --- |'
];

const loopRenderJobsMarkdown = [
  '# Canonical loop render jobs',
  '',
  'Generated by `npm run assets:prepare`.',
  '',
  `Ready loop render jobs: ${visibleLoopRenderJobs.length}`,
  '',
  '| State | Label | Variant | Still reference copy | Loop target | Render dir |',
  '| --- | --- | --- | --- | --- | --- |'
];

const stagedRenderHandoffMarkdown = [
  '# Canonical staged render handoff',
  '',
  'Generated by `npm run assets:prepare`.',
  '',
  `Total staged render jobs: ${visibleStagedRenderHandoff.length}`,
  `Frontier still handoffs: ${visibleStillRenderJobs.length}`,
  `Loop handoffs: ${visibleLoopRenderJobs.length}`,
  '',
  '| Priority | Type | State | Variant | Target | Render manifest | Render prompt | Reference copy |',
  '| --- | --- | --- | --- | --- | --- | --- | --- |'
];

const nextActionsMarkdown = [
  '# Canonical production next actions',
  '',
  'Generated by `npm run assets:prepare`.',
  '',
  `Total next actions: ${nextActions.length}`,
  `Frontier still actions: ${visibleStillQueue.length}`,
  `Unblocked loop actions: ${visibleLoopQueue.length}`,
  '',
  '| Priority | Type | State | Label | Target | Source | Notes |',
  '| --- | --- | --- | --- | --- | --- | --- |'
];

for (const item of visibleLoopQueue) {
  loopQueueMarkdown.push(`| ${String(item.stateIndex).padStart(2, '0')} | ${item.label} | ${item.variant.toUpperCase()} | ${item.stillSource} | ${item.loopTarget} | ${item.notes} |`);
}

for (const item of visibleStillQueue) {
  stillQueueMarkdown.push(`| ${String(item.stateIndex).padStart(2, '0')} | ${item.label} | ${item.direction} | ${item.referenceStateId ?? '—'} | ${item.outputDir} | ${item.notes} |`);
}

for (const item of visibleImageGenerationJobs) {
  imageGenerationMarkdown.push(`| ${String(item.stateIndex).padStart(2, '0')} | ${item.label} | ${item.model} | ${item.image ?? '—'} | ${item.originalReferenceImage ?? '—'} | ${item.outputDir} | ${item.canonicalTarget} | ${item.suggestedOutputs.join('<br />')} |`);
}

for (const job of visibleStillRenderJobs) {
  stillRenderJobsMarkdown.push(`| ${String(job.stateIndex).padStart(2, '0')} | ${job.label} | ${job.direction} | ${job.referenceStateId ?? '—'} | ${job.bridgeReferenceCopy ?? '—'} | ${job.sanitizedBridgeReferenceCopy ?? '—'} | ${job.outputDir} |`);
}

for (const job of visibleLoopRenderJobs) {
  loopRenderJobsMarkdown.push(`| ${String(job.stateIndex).padStart(2, '0')} | ${job.label} | ${job.variant.toUpperCase()} | ${job.stillReferenceCopy ?? '—'} | ${job.loopTarget} | ${job.renderDir} |`);
}

for (const item of visibleStagedRenderHandoff) {
  stagedRenderHandoffMarkdown.push(`| ${item.priority} | ${item.type} | ${String(item.stateIndex).padStart(2, '0')} | ${item.variant ? item.variant.toUpperCase() : '—'} | ${item.target} | ${item.renderManifestPath} | ${item.renderPromptPath} | ${item.referenceCopy ?? '—'} |`);
}

for (const action of nextActions) {
  nextActionsMarkdown.push(`| ${action.priority} | ${action.type} | ${String(action.stateIndex).padStart(2, '0')} | ${action.label} | ${action.target} | ${action.source} | ${action.notes} |`);
}

await fs.writeFile(path.join(outputDir, 'canonical-asset-checklist.md'), `${markdown.join('\n')}\n`);
await fs.writeFile(path.join(outputDir, 'canonical-loop-generation-queue.md'), `${loopQueueMarkdown.join('\n')}\n`);
await fs.writeFile(path.join(outputDir, 'canonical-still-generation-queue.md'), `${stillQueueMarkdown.join('\n')}\n`);
await fs.writeFile(path.join(outputDir, 'canonical-image-generation-jobs.md'), `${imageGenerationMarkdown.join('\n')}\n`);
await fs.writeFile(path.join(outputDir, 'canonical-still-render-jobs.md'), `${stillRenderJobsMarkdown.join('\n')}\n`);
await fs.writeFile(path.join(outputDir, 'canonical-loop-render-jobs.md'), `${loopRenderJobsMarkdown.join('\n')}\n`);
await fs.writeFile(path.join(outputDir, 'canonical-staged-render-handoff.md'), `${stagedRenderHandoffMarkdown.join('\n')}\n`);
await fs.writeFile(path.join(outputDir, 'canonical-production-next-actions.md'), `${nextActionsMarkdown.join('\n')}\n`);

console.log(`Prepared canonical asset workspace for ${manifest.length} states.`);
console.log(`Approved loops detected: ${approvedLoopCount}`);
console.log(`Loop targets ready to generate: ${visibleReadyLoopCount}`);
console.log(`Checklist: ${path.relative(root, path.join(outputDir, 'canonical-asset-checklist.md'))}`);
console.log(`Still queue: ${path.relative(root, path.join(outputDir, 'canonical-still-generation-queue.md'))}`);
console.log(`Image generation jobs: ${path.relative(root, path.join(outputDir, 'canonical-image-generation-jobs.md'))}`);
console.log(`Still render jobs: ${path.relative(root, path.join(outputDir, 'canonical-still-render-jobs.md'))}`);
console.log(`Loop queue: ${path.relative(root, path.join(outputDir, 'canonical-loop-generation-queue.md'))}`);
console.log(`Loop render jobs: ${path.relative(root, path.join(outputDir, 'canonical-loop-render-jobs.md'))}`);
console.log(`Staged render handoff: ${path.relative(root, path.join(outputDir, 'canonical-staged-render-handoff.md'))}`);
console.log(`Next actions: ${path.relative(root, path.join(outputDir, 'canonical-production-next-actions.md'))}`);
console.log(`Batch JSON: ${path.relative(root, path.join(outputDir, 'canonical-asset-batch.json'))}`);

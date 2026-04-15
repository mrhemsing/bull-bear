import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = process.cwd();
const generatedDir = path.join(root, 'data', 'generated');
const reviewPath = path.join(generatedDir, 'still-candidate-review.json');
const promotionLogPath = path.join(generatedDir, 'still-promotion-log.json');
const postPromotionPlanPath = path.join(generatedDir, 'still-promotion-next-step.md');

const stateArg = process.argv.find((arg) => arg.startsWith('--state='));
const candidateArg = process.argv.find((arg) => arg.startsWith('--candidate='));
const variantArg = process.argv.find((arg) => arg.startsWith('--variant='));
const timeoutArg = process.argv.find((arg) => arg.startsWith('--timeout-ms='));
const modelArg = process.argv.find((arg) => arg.startsWith('--model='));
const stageLoopRerender = process.argv.includes('--stage-loop-rerender');
const overwriteReviewFrames = process.argv.includes('--overwrite-review-frames') || process.argv.includes('--overwrite');
const dryRun = process.argv.includes('--dry-run');

const selectedState = stateArg ? stateArg.split('=')[1].trim() : null;
const selectedCandidate = candidateArg ? Number.parseInt(candidateArg.split('=')[1].trim(), 10) : null;
const selectedVariant = variantArg ? variantArg.split('=')[1].trim().toLowerCase() : 'b';
const selectedTimeoutMs = timeoutArg ? timeoutArg.split('=')[1].trim() : (process.env.FAL_VIDEO_TIMEOUT_MS?.trim() || null);
const selectedModel = modelArg ? modelArg.split('=')[1].trim() : (process.env.FAL_VIDEO_MODEL?.trim() || null);

if (!selectedState || !selectedCandidate || Number.isNaN(selectedCandidate)) {
  console.error('Usage: node scripts/promote-still-candidate.mjs --state=state-20 --candidate=2 [--variant=b] [--stage-loop-rerender] [--timeout-ms=900000] [--model=...] [--dry-run]');
  process.exit(1);
}

const readJson = async (targetPath) => JSON.parse(await fs.readFile(targetPath, 'utf8'));
const readJsonIfExists = async (targetPath) => {
  try {
    return JSON.parse(await fs.readFile(targetPath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
};
const resolveFromRoot = (relativePath) => path.join(root, relativePath.replace(/^[/\\]+/, '').replace(/\//g, path.sep));
const relativeFromRoot = (targetPath) => path.relative(root, targetPath).replace(/\\/g, '/');
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

const review = await readJson(reviewPath);
const entry = review.entries.find((item) => item.stateId === selectedState);
if (!entry) {
  console.error(`No still candidate review entry found for ${selectedState}.`);
  process.exit(1);
}

const candidate = entry.outputs.find((item) => item.index === selectedCandidate);
if (!candidate) {
  console.error(`No candidate ${selectedCandidate} found for ${selectedState}.`);
  process.exit(1);
}

const sourcePath = candidate.filesystemPath;
const targetPath = resolveFromRoot(entry.canonicalTarget.replace(/^\//, 'public/'));
const backupDir = path.join(root, 'out', 'still-promotion-backups', entry.stateId);
const backupPath = path.join(backupDir, `${entry.stateId}-still-before-candidate-${String(selectedCandidate).padStart(2, '0')}.png`);
await fs.access(sourcePath);
await fs.mkdir(path.dirname(targetPath), { recursive: true });
await fs.mkdir(backupDir, { recursive: true });

let existingTarget = false;
try {
  await fs.access(targetPath);
  existingTarget = true;
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

const rerenderArgs = [
  `--states=${entry.stateId}`,
  `--variant=${selectedVariant}`,
  '--overwrite-review-frames',
];
if (selectedTimeoutMs) rerenderArgs.push(`--timeout-ms=${selectedTimeoutMs}`);
if (selectedModel) rerenderArgs.push(`--model=${selectedModel}`);
const rerenderCommand = `${quoteArg(process.execPath)} scripts/run-paper-money-rerender.mjs ${rerenderArgs.map(quoteArg).join(' ')}`;

const promotionRecord = {
  recordedAt: new Date().toISOString(),
  stateId: entry.stateId,
  stateIndex: entry.stateIndex,
  label: entry.label,
  candidate: selectedCandidate,
  source: relativeFromRoot(sourcePath),
  sourceFilesystemPath: sourcePath,
  target: entry.canonicalTarget,
  targetFilesystemPath: targetPath,
  backup: relativeFromRoot(backupPath),
  backupFilesystemPath: backupPath,
  provider: entry.provider,
  model: entry.model,
  referenceImage: entry.referenceImage,
  variant: selectedVariant,
  timeoutMs: selectedTimeoutMs,
  rerenderModel: selectedModel,
  rerenderCommand,
  stageLoopRerender,
  dryRun,
};

const existingLog = (await readJsonIfExists(promotionLogPath)) ?? [];
existingLog.push(promotionRecord);

if (!dryRun && existingTarget) {
  await fs.copyFile(targetPath, backupPath);
}

if (!dryRun) {
  await fs.copyFile(sourcePath, targetPath);
}

let stageResult = null;
if (!dryRun && stageLoopRerender) {
  stageResult = await runNodeScript('scripts/run-paper-money-rerender.mjs', [...rerenderArgs, '--prep-only']);
}

const nextStepLines = [
  '# Still promotion next step',
  '',
  `Recorded at: ${promotionRecord.recordedAt}`,
  `State: ${entry.stateId} · ${entry.label}`,
  `Promoted candidate: ${selectedCandidate}`,
  `Canonical target: ${entry.canonicalTarget}`,
  `Backup file: ${relativeFromRoot(backupPath)}`,
  `Loop variant for follow-up: ${selectedVariant}`,
  `Timeout override ms: ${selectedTimeoutMs ?? 'default'}`,
  `Loop model override: ${selectedModel ?? 'default'}`,
  '',
  '## Next command',
  '',
  '```bash',
  rerenderCommand,
  '```',
  '',
  '## Notes',
  '',
  '- Review the regenerated start/end/diff seam evidence before accepting the loop.',
  '- Reject the loop if paper-like debris is gone but composition still snaps or drifts at the seam.',
];

if (stageLoopRerender) {
  nextStepLines.push('', '## Queue staging', '', stageResult?.code === 0
    ? '- Prep-only rerender staging completed successfully; reopen `data/generated/paper-money-rerender-report.md` before running the full rerender.'
    : '- Prep-only rerender staging failed; inspect the latest console output and rerun the command above after fixing the issue.');
}

await fs.writeFile(postPromotionPlanPath, `${nextStepLines.join('\n')}\n`);
await fs.writeFile(promotionLogPath, `${JSON.stringify(existingLog, null, 2)}\n`);

console.log(`${dryRun ? 'Would promote' : 'Promoted'} ${relativeFromRoot(sourcePath)} -> ${relativeFromRoot(targetPath)}.`);
if (!dryRun && existingTarget) {
  console.log(`Backed up previous still to ${relativeFromRoot(backupPath)}.`);
}
if (!dryRun) {
  console.log(`Wrote next-step plan to ${relativeFromRoot(postPromotionPlanPath)}.`);
}
if (stageLoopRerender) {
  console.log(`${dryRun ? 'Would stage' : 'Staged'} targeted loop rerender prep for ${entry.stateId}/${selectedVariant}.`);
}
console.log(`Logged promotion to ${relativeFromRoot(promotionLogPath)}.`);

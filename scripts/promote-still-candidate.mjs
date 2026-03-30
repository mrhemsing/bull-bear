import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const reviewPath = path.join(root, 'data', 'generated', 'still-candidate-review.json');
const promotionLogPath = path.join(root, 'data', 'generated', 'still-promotion-log.json');

const stateArg = process.argv.find((arg) => arg.startsWith('--state='));
const candidateArg = process.argv.find((arg) => arg.startsWith('--candidate='));
const dryRun = process.argv.includes('--dry-run');

const selectedState = stateArg ? stateArg.split('=')[1].trim() : null;
const selectedCandidate = candidateArg ? Number.parseInt(candidateArg.split('=')[1].trim(), 10) : null;

if (!selectedState || !selectedCandidate || Number.isNaN(selectedCandidate)) {
  console.error('Usage: node scripts/promote-still-candidate.mjs --state=state-20 --candidate=2 [--dry-run]');
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
await fs.access(sourcePath);
await fs.mkdir(path.dirname(targetPath), { recursive: true });

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
  provider: entry.provider,
  model: entry.model,
  referenceImage: entry.referenceImage,
  dryRun,
};

const existingLog = (await readJsonIfExists(promotionLogPath)) ?? [];
existingLog.push(promotionRecord);

if (!dryRun) {
  await fs.copyFile(sourcePath, targetPath);
}

await fs.writeFile(promotionLogPath, `${JSON.stringify(existingLog, null, 2)}\n`);

console.log(`${dryRun ? 'Would promote' : 'Promoted'} ${relativeFromRoot(sourcePath)} -> ${relativeFromRoot(targetPath)}.`);
console.log(`Logged promotion to ${relativeFromRoot(promotionLogPath)}.`);

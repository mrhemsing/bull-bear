import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = process.cwd();
const generatedDir = path.join(root, 'data', 'generated');
const pendingPath = path.join(generatedDir, 'pending-still-pick.json');

const stripWrappedQuotes = (value) => {
  if (typeof value !== 'string' || value.length < 2) {
    return value;
  }

  const first = value[0];
  const last = value[value.length - 1];
  if ((first === '"' && last === '"') || (first === '\'' && last === '\'')) {
    return value.slice(1, -1);
  }

  return value;
};

const stateArg = process.argv.find((arg) => arg.startsWith('--state='));
const candidateArg = process.argv.find((arg) => arg.startsWith('--candidate='));
const verdictArg = process.argv.find((arg) => arg.startsWith('--verdict='));
const noteArg = process.argv.find((arg) => arg.startsWith('--note='));
const noRefresh = process.argv.includes('--no-refresh');

const selectedState = stateArg ? stateArg.split('=')[1].trim() : null;
const selectedCandidate = candidateArg ? Number.parseInt(candidateArg.split('=')[1].trim(), 10) : null;
const selectedVerdict = verdictArg ? verdictArg.split('=')[1].trim().toLowerCase() : null;
const selectedNote = noteArg ? stripWrappedQuotes(noteArg.split('=')[1].trim()) : '';

const allowedVerdicts = new Set(['unreviewed', 'reject', 'promote', 'hold']);

if (!selectedState || !selectedCandidate || Number.isNaN(selectedCandidate) || !selectedVerdict || !allowedVerdicts.has(selectedVerdict)) {
  console.error('Usage: node scripts/record-still-review.mjs --state=state-20 --candidate=4 --verdict=reject|promote|hold|unreviewed [--note="..."] [--no-refresh]');
  process.exit(1);
}

const readJson = async (targetPath) => JSON.parse(await fs.readFile(targetPath, 'utf8'));
const writeJson = async (targetPath, value) => fs.writeFile(targetPath, `${JSON.stringify(value, null, 2)}\n`);

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

  child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
});

const pending = await readJson(pendingPath);
const entry = pending.pending?.find((item) => item.stateId === selectedState);
if (!entry) {
  console.error(`No pending still-pick entry found for ${selectedState}.`);
  process.exit(1);
}

const candidate = entry.candidates?.find((item) => item.index === selectedCandidate);
if (!candidate) {
  console.error(`No candidate ${selectedCandidate} found for ${selectedState}.`);
  process.exit(1);
}

candidate.reviewVerdict = selectedVerdict;
candidate.reviewNote = selectedNote || (
  selectedVerdict === 'reject'
    ? 'Rejected in human review. Do not promote this still; continue shortlist review.'
    : selectedVerdict === 'promote'
      ? 'Chosen in human review as the cleaned still anchor candidate. Promote this still, rerender the loop, and recheck debris + seam acceptance before approving the animation.'
      : selectedVerdict === 'hold'
        ? 'Needs more human comparison before approval or rejection.'
        : 'Pending human review. Reject if debris-focus crops still show detached rectangular scraps; only promote if paper-free and identity/framing still match.'
);

candidate.reviewedAt = new Date().toISOString();

await writeJson(pendingPath, pending);
console.log(`Updated ${selectedState} candidate ${selectedCandidate} -> ${selectedVerdict}.`);

if (!noRefresh) {
  const refresh = await runNodeScript('scripts/build-pending-still-pick.mjs', [`--state=${selectedState}`]);
  if (refresh.code !== 0) {
    process.exit(refresh.code);
  }
}

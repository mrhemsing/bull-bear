import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { revalidatePath } from 'next/cache';

interface ReviewQueueEntry {
  stateId: string;
  label: string;
  reviewType: string;
  sourceDir: string;
  selectedFile: string | null;
  candidateFiles: string[];
  notes: string | null;
}

interface ChecklistEntry {
  id: string;
  index: number;
  label: string;
  still: {
    target: string;
    status: string;
    reviewSource: string | null;
    selectedAnchor: {
      sourceFile: string;
      canonicalTarget: string;
      notes?: string;
    } | null;
    candidateFiles: string[];
  };
}

const repoRoot = process.cwd();
const reviewQueuePath = path.join(repoRoot, 'data', 'generated', 'canonical-review-queue.json');
const checklistPath = path.join(repoRoot, 'data', 'generated', 'canonical-asset-checklist.json');
const runExecFile = promisify(execFile);

function isSafeRelativePath(value: string) {
  return !path.isAbsolute(value) && !value.split(/[\\/]+/).includes('..');
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const stateId = typeof body.stateId === 'string' ? body.stateId : '';
    const candidateFile = typeof body.candidateFile === 'string' ? body.candidateFile : '';

    if (!stateId || !candidateFile || !isSafeRelativePath(candidateFile)) {
      return Response.json({ error: 'Invalid selection payload.' }, { status: 400 });
    }

    const reviewQueue = JSON.parse(await readFile(reviewQueuePath, 'utf8')) as ReviewQueueEntry[];
    const checklist = JSON.parse(await readFile(checklistPath, 'utf8')) as ChecklistEntry[];

    const reviewEntry = reviewQueue.find((entry) => entry.stateId === stateId);
    const checklistEntry = checklist.find((entry) => entry.id === stateId);

    if (!reviewEntry || !checklistEntry) {
      return Response.json({ error: 'State not found in review data.' }, { status: 404 });
    }

    if (!reviewEntry.candidateFiles.includes(candidateFile) || !checklistEntry.still.candidateFiles.includes(candidateFile)) {
      return Response.json({ error: 'Candidate file is not in the review queue for that state.' }, { status: 400 });
    }

    const sourceRelativePath = path.join(reviewEntry.sourceDir, candidateFile);
    const sourceAbsolutePath = path.join(repoRoot, sourceRelativePath);
    const canonicalTargetRelativePath = checklistEntry.still.target.replace(/^\//, 'public/');
    const canonicalTargetAbsolutePath = path.join(repoRoot, canonicalTargetRelativePath);

    await mkdir(path.dirname(canonicalTargetAbsolutePath), { recursive: true });
    await copyFile(sourceAbsolutePath, canonicalTargetAbsolutePath);

    reviewEntry.selectedFile = candidateFile;
    reviewEntry.reviewType = 'approved-adjacent';
    reviewEntry.notes = `Approved in-app and promoted to ${checklistEntry.still.target}.`;

    checklistEntry.still.status = `approved adjacent winner (${candidateFile})`;
    checklistEntry.still.reviewSource = sourceRelativePath;
    checklistEntry.still.selectedAnchor = {
      sourceFile: sourceRelativePath,
      canonicalTarget: canonicalTargetRelativePath.replace(/\\/g, '/'),
      notes: `Approved in-app from ${reviewEntry.sourceDir}.`
    };
    checklistEntry.still.candidateFiles = [];

    await writeFile(reviewQueuePath, `${JSON.stringify(reviewQueue, null, 2)}\n`, 'utf8');
    await writeFile(checklistPath, `${JSON.stringify(checklist, null, 2)}\n`, 'utf8');

    await runExecFile(process.execPath, [path.join(repoRoot, 'scripts', 'prepare-canonical-assets.mjs')], {
      cwd: repoRoot,
      timeout: 120000
    });

    revalidatePath('/');
    revalidatePath('/visual-update');

    return Response.json({
      ok: true,
      stateId,
      candidateFile,
      promotedTo: checklistEntry.still.target
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}

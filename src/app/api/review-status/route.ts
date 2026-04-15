import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { getAssetProductionSummary } from '@/lib/asset-production';

const reviewStatusSourceFiles = [
  'canonical-review-queue.json',
  'canonical-asset-checklist.json',
  'canonical-production-next-actions.json',
  'canonical-still-generation-queue.json',
  'canonical-loop-generation-queue.json'
] as const;

function createReviewStatusEtag(body: string) {
  return `W/"${Buffer.byteLength(body)}-${Buffer.from(body).toString('base64url')}"`;
}

function requestMatchesEtag(request: Request, etag: string) {
  const raw = request.headers.get('if-none-match');
  if (!raw) return false;

  return raw
    .split(',')
    .map((value) => value.trim())
    .some((value) => value === '*' || value === etag);
}

function requestMatchesLastModified(request: Request, lastModifiedAt: string | null) {
  if (!lastModifiedAt) return false;

  const raw = request.headers.get('if-modified-since');
  if (!raw) return false;

  const requestMs = Date.parse(raw);
  const lastModifiedMs = Date.parse(lastModifiedAt);
  if (!Number.isFinite(requestMs) || !Number.isFinite(lastModifiedMs)) return false;

  return Math.trunc(lastModifiedMs / 1000) * 1000 <= requestMs;
}

function getReviewStatusSourceSummary() {
  const generatedDir = path.join(process.cwd(), 'data', 'generated');
  const sourceEntries = reviewStatusSourceFiles.map((fileName) => {
    const resolvedPath = path.join(generatedDir, fileName);
    if (!existsSync(resolvedPath)) {
      return {
        fileName,
        exists: false,
        updatedAt: null,
      };
    }

    const ms = statSync(resolvedPath).mtimeMs;
    return {
      fileName,
      exists: true,
      updatedAt: Number.isFinite(ms) ? new Date(ms).toISOString() : null,
    };
  });

  const presentFiles = sourceEntries.filter((entry) => entry.exists).map((entry) => entry.fileName);
  const missingFiles = sourceEntries.filter((entry) => !entry.exists).map((entry) => entry.fileName);
  const latestUpdatedAt = sourceEntries
    .map((entry) => entry.updatedAt)
    .filter(Boolean)
    .map((value) => ({ value, ms: Date.parse(value as string) }))
    .filter((entry) => Number.isFinite(entry.ms))
    .sort((a, b) => b.ms - a.ms)[0]?.value ?? null;

  return {
    expectedFiles: [...reviewStatusSourceFiles],
    expectedCount: reviewStatusSourceFiles.length,
    presentFiles,
    missingFiles,
    missingCount: missingFiles.length,
    allPresent: missingFiles.length === 0,
    latestUpdatedAt,
  };
}

function getReviewStatusSummary(checkedAt: string | null) {
  const summary = getAssetProductionSummary();
  const sourceSummary = getReviewStatusSourceSummary();

  return {
    checkedAt,
    totalStates: summary.totalStates,
    approvedStills: summary.approvedStills,
    candidateStates: summary.candidateStates,
    pendingStates: summary.pendingStates,
    totalCandidateImages: summary.totalCandidateImages,
    fullCoverageComplete: summary.fullCoverageComplete,
    activeRange: summary.activeRange,
    frontierStates: summary.frontierStates,
    reviewSourceExpectedCount: sourceSummary.expectedCount,
    reviewSourceMissingCount: sourceSummary.missingCount,
    reviewSourceExpectedFiles: sourceSummary.expectedFiles,
    reviewSourcePresentFiles: sourceSummary.presentFiles,
    reviewSourceMissingFiles: sourceSummary.missingFiles,
    reviewSourceAllPresent: sourceSummary.allPresent,
    reviewQueue: summary.reviewQueue,
    reviewQueuePreview: summary.reviewQueue.slice(0, 6),
    candidateStatesList: summary.candidateStatesList,
    pendingStatesPreview: summary.pendingStatesPreview,
    stillQueueCount: summary.stillQueue.length,
    stillQueuePreview: summary.stillQueuePreview,
    loopQueueCount: summary.loopQueue.length,
    loopQueuePreview: summary.loopQueuePreview,
    nextActionsCount: summary.nextActions.length,
    nextActionsPreview: summary.nextActionsPreview
  };
}

function createReviewStatusHeaders(
  summary: ReturnType<typeof getReviewStatusSummary>,
  contentLength: number,
  etag: string,
  lastModifiedAt: string | null
) {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-cache',
    'Content-Length': String(contentLength),
    ETag: etag,
    Vary: 'If-None-Match, If-Modified-Since',
    'Last-Modified': lastModifiedAt ? new Date(lastModifiedAt).toUTCString() : '',
    'X-Review-Status-Approved-Stills': String(summary.approvedStills),
    'X-Review-Status-Candidate-States': String(summary.candidateStates),
    'X-Review-Status-Pending-States': String(summary.pendingStates),
    'X-Review-Status-Review-Queue-Count': String(summary.reviewQueue.length),
    'X-Review-Status-Total-Candidate-Images': String(summary.totalCandidateImages),
    'X-Review-Status-Still-Queue-Count': String(summary.stillQueueCount),
    'X-Review-Status-Loop-Queue-Count': String(summary.loopQueueCount),
    'X-Review-Status-Next-Actions-Count': String(summary.nextActionsCount),
    'X-Review-Status-Expected-Files': summary.reviewSourceExpectedFiles.join(','),
    'X-Review-Status-Missing-Files': summary.reviewSourceMissingFiles.join(','),
    'X-Review-Status-Expected-Count': String(summary.reviewSourceExpectedCount),
    'X-Review-Status-Missing-Count': String(summary.reviewSourceMissingCount),
    'X-Review-Status-All-Present': String(summary.reviewSourceAllPresent),
    'X-Review-Status-Active-Range': summary.activeRange ? `${summary.activeRange.start}-${summary.activeRange.end}` : '',
    'X-Review-Status-Frontier-States': summary.frontierStates.map((item) => item.id).join(','),
    'X-Review-Status-Full-Coverage': String(summary.fullCoverageComplete)
  };
}

function createReviewStatusResponse(request: Request, options: { includeBody: boolean }) {
  const sourceSummary = getReviewStatusSourceSummary();
  const lastModifiedAt = sourceSummary.latestUpdatedAt;
  const summary = getReviewStatusSummary(lastModifiedAt);
  const body = JSON.stringify(summary, null, 2);
  const etag = createReviewStatusEtag(body);
  const headers = createReviewStatusHeaders(summary, Buffer.byteLength(body), etag, lastModifiedAt);

  if (requestMatchesEtag(request, etag) || requestMatchesLastModified(request, lastModifiedAt)) {
    return new Response(null, { status: 304, headers });
  }

  return new Response(options.includeBody ? body : null, { headers });
}

export function GET(request: Request) {
  return createReviewStatusResponse(request, { includeBody: true });
}

export function HEAD(request: Request) {
  return createReviewStatusResponse(request, { includeBody: false });
}

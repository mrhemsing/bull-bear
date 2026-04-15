import { createHash } from 'node:crypto';
import { getAssetProductionSummary } from '@/lib/asset-production';

function createAssetProductionStatusEtag(body: string) {
  return `W/"${Buffer.byteLength(body)}-${createHash('sha1').update(body).digest('hex')}"`;
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

function getAssetProductionStatusLastModified(summary: ReturnType<typeof getAssetProductionSummary>) {
  const candidates = [
    ...summary.artifactEntries.map((entry) => entry.updatedAt),
    summary.imageGenerationSummary.latestRecordedAt,
    summary.loopGenerationSummary.latestRecordedAt
  ].filter(Boolean) as string[];

  return candidates
    .map((value) => ({ value, ms: Date.parse(value) }))
    .filter((entry) => Number.isFinite(entry.ms))
    .sort((a, b) => b.ms - a.ms)[0]?.value ?? null;
}

function createAssetProductionStatusHeaders(
  summary: ReturnType<typeof getAssetProductionSummary>,
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
    'X-Asset-Production-Approved-Stills': String(summary.approvedStills),
    'X-Asset-Production-Total-States': String(summary.totalStates),
    'X-Asset-Production-Approved-Loops': String(summary.approvedLoops),
    'X-Asset-Production-Ready-Loop-Targets': String(summary.readyLoopTargets),
    'X-Asset-Production-Pending-States': String(summary.pendingStates),
    'X-Asset-Production-Review-States': String(summary.candidateStates),
    'X-Asset-Production-Next-Actions': String(summary.nextActions.length),
    'X-Asset-Production-Staged-Handoffs': String(summary.stagedRenderHandoff.length),
    'X-Asset-Production-Artifact-Count': String(summary.artifactEntries.length),
    'X-Asset-Production-Artifact-Expected-Count': String(summary.expectedArtifactCount),
    'X-Asset-Production-Artifact-Missing-Count': String(summary.missingArtifactCount),
    'X-Asset-Production-Artifact-All-Present': String(summary.allArtifactsPresent),
    'X-Asset-Production-Artifact-Fresh-Count': String(summary.artifactFreshCount),
    'X-Asset-Production-Artifact-Stale-Count': String(summary.artifactStaleCount),
    'X-Asset-Production-Artifact-Stale-Threshold-Hours': String(summary.assetArtifactStaleThresholdHours),
    'X-Asset-Production-Image-Ledger-Freshness': summary.imageGenerationSummary.freshness.verdict,
    'X-Asset-Production-Image-Ledger-Latest-At': summary.imageGenerationSummary.latestRecordedAt ?? '',
    'X-Asset-Production-Loop-Ledger-Freshness': summary.loopGenerationSummary.freshness.verdict,
    'X-Asset-Production-Loop-Ledger-Latest-At': summary.loopGenerationSummary.latestRecordedAt ?? '',
    'X-Asset-Production-Full-Coverage': String(summary.fullCoverageComplete)
  };
}

function createAssetProductionStatusResponse(request: Request, options: { includeBody: boolean }) {
  const summary = getAssetProductionSummary();
  const body = JSON.stringify(summary, null, 2);
  const etag = createAssetProductionStatusEtag(body);
  const lastModifiedAt = getAssetProductionStatusLastModified(summary);
  const headers = createAssetProductionStatusHeaders(summary, Buffer.byteLength(body), etag, lastModifiedAt);

  if (requestMatchesEtag(request, etag) || requestMatchesLastModified(request, lastModifiedAt)) {
    return new Response(null, { status: 304, headers });
  }

  return new Response(options.includeBody ? body : null, {
    headers
  });
}

export function GET(request: Request) {
  return createAssetProductionStatusResponse(request, { includeBody: true });
}

export function HEAD(request: Request) {
  return createAssetProductionStatusResponse(request, { includeBody: false });
}

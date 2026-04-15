import { getReleaseArtifactSummary } from '@/lib/release-artifacts';

function createReleaseArtifactStatusEtag(body: string) {
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

function requestMatchesLastModified(request: Request, lastModifiedAt: string) {
  const raw = request.headers.get('if-modified-since');
  if (!raw) return false;

  const requestMs = Date.parse(raw);
  const lastModifiedMs = Date.parse(lastModifiedAt);
  if (!Number.isFinite(requestMs) || !Number.isFinite(lastModifiedMs)) return false;

  return Math.trunc(lastModifiedMs / 1000) * 1000 <= requestMs;
}

function createReleaseArtifactStatusHeaders(
  summary: Awaited<ReturnType<typeof getReleaseArtifactSummary>>,
  contentLength: number,
  etag: string
) {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-cache',
    'Content-Length': String(contentLength),
    ETag: etag,
    Vary: 'If-None-Match, If-Modified-Since',
    'Last-Modified': new Date(summary.checkedAt).toUTCString(),
    'X-Release-Artifact-Count': String(summary.artifactCount),
    'X-Release-Artifact-Expected-Count': String(summary.expectedArtifactCount),
    'X-Release-Artifact-Missing-Count': String(summary.missingCount),
    'X-Release-Artifact-Expected-Files': summary.expectedArtifactFiles.join(','),
    'X-Release-Artifact-Missing-Files': summary.missingFiles.join(','),
    'X-Release-Artifact-All-Present': String(summary.allPresent),
    'X-Release-Artifact-Fresh-Count': String(summary.freshCount),
    'X-Release-Artifact-Stale-Count': String(summary.staleCount),
    'X-Release-Artifact-All-Fresh': String(summary.allFresh),
    'X-Release-Artifact-Stale-Threshold-Hours': String(summary.staleThresholdHours),
    'X-Release-Artifact-Latest-File': summary.latestArtifact?.fileName ?? '',
    'X-Release-Artifact-Latest-Updated-At': summary.latestArtifact?.updatedAt ?? '',
    'X-Release-Artifact-Latest-Age': summary.latestArtifact?.age ?? 'unknown',
    'X-Release-Artifact-Latest-Freshness': summary.latestArtifact?.freshness ?? 'unknown',
    'X-Release-Artifact-Oldest-File': summary.oldestArtifact?.fileName ?? '',
    'X-Release-Artifact-Oldest-Updated-At': summary.oldestArtifact?.updatedAt ?? '',
    'X-Release-Artifact-Oldest-Age': summary.oldestArtifact?.age ?? 'unknown',
    'X-Release-Artifact-Oldest-Freshness': summary.oldestArtifact?.freshness ?? 'unknown'
  };
}

async function createReleaseArtifactStatusResponse(request: Request, options: { includeBody: boolean }) {
  const summary = await getReleaseArtifactSummary();
  const body = JSON.stringify(summary, null, 2);
  const etag = createReleaseArtifactStatusEtag(body);
  const headers = createReleaseArtifactStatusHeaders(summary, Buffer.byteLength(body), etag);

  if (requestMatchesEtag(request, etag) || requestMatchesLastModified(request, summary.checkedAt)) {
    return new Response(null, {
      status: 304,
      headers
    });
  }

  return new Response(options.includeBody ? body : null, {
    headers
  });
}

export async function GET(request: Request) {
  return createReleaseArtifactStatusResponse(request, { includeBody: true });
}

export async function HEAD(request: Request) {
  return createReleaseArtifactStatusResponse(request, { includeBody: false });
}

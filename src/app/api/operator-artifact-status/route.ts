import { getOperatorArtifactSummary } from '@/lib/operator-artifacts';

function createOperatorArtifactStatusEtag(body: string) {
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

function createOperatorArtifactStatusHeaders(
  summary: Awaited<ReturnType<typeof getOperatorArtifactSummary>>,
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
    'X-Operator-Artifact-Count': String(summary.artifactCount),
    'X-Operator-Artifact-Expected-Count': String(summary.expectedArtifactCount),
    'X-Operator-Artifact-Missing-Count': String(summary.missingCount),
    'X-Operator-Artifact-Expected-Files': summary.expectedArtifactFiles.join(','),
    'X-Operator-Artifact-Missing-Files': summary.missingFiles.join(','),
    'X-Operator-Artifact-All-Present': String(summary.allPresent),
    'X-Operator-Artifact-Fresh-Count': String(summary.freshCount),
    'X-Operator-Artifact-Stale-Count': String(summary.staleCount),
    'X-Operator-Artifact-All-Fresh': String(summary.allFresh),
    'X-Operator-Artifact-Stale-Threshold-Hours': String(summary.staleThresholdHours),
    'X-Operator-Artifact-Latest-File': summary.latestArtifact?.fileName ?? '',
    'X-Operator-Artifact-Latest-Updated-At': summary.latestArtifact?.updatedAt ?? '',
    'X-Operator-Artifact-Latest-Age': summary.latestArtifact?.age ?? 'unknown',
    'X-Operator-Artifact-Latest-Freshness': summary.latestArtifact?.freshness ?? 'unknown',
    'X-Operator-Artifact-Oldest-File': summary.oldestArtifact?.fileName ?? '',
    'X-Operator-Artifact-Oldest-Updated-At': summary.oldestArtifact?.updatedAt ?? '',
    'X-Operator-Artifact-Oldest-Age': summary.oldestArtifact?.age ?? 'unknown',
    'X-Operator-Artifact-Oldest-Freshness': summary.oldestArtifact?.freshness ?? 'unknown'
  };
}

async function createOperatorArtifactStatusResponse(request: Request, options: { includeBody: boolean }) {
  const summary = await getOperatorArtifactSummary();
  const body = JSON.stringify(summary, null, 2);
  const etag = createOperatorArtifactStatusEtag(body);
  const headers = createOperatorArtifactStatusHeaders(summary, Buffer.byteLength(body), etag);

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
  return createOperatorArtifactStatusResponse(request, { includeBody: true });
}

export async function HEAD(request: Request) {
  return createOperatorArtifactStatusResponse(request, { includeBody: false });
}

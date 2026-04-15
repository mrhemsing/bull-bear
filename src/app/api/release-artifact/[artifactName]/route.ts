import { readFile } from 'node:fs/promises';
import { getReleaseArtifactMeta } from '@/lib/release-artifacts';

function createArtifactEtag(size: number, updatedAt: string) {
  return `W/"${size}-${Math.trunc(Date.parse(updatedAt))}"`;
}

function requestMatchesEtag(request: Request, etag: string) {
  const raw = request.headers.get('if-none-match');
  if (!raw) return false;

  return raw
    .split(',')
    .map((value) => value.trim())
    .some((value) => value === '*' || value === etag);
}

function requestMatchesLastModified(request: Request, updatedAt: string) {
  const raw = request.headers.get('if-modified-since');
  if (!raw) return false;

  const parsed = Date.parse(raw);
  const updatedAtMs = Date.parse(updatedAt);
  if (!Number.isFinite(parsed) || !Number.isFinite(updatedAtMs)) return false;

  return Math.trunc(updatedAtMs / 1000) * 1000 <= parsed;
}

async function createArtifactResponse(
  request: Request,
  context: { params: { artifactName: string } },
  options: { includeBody: boolean }
) {
  const artifact = await getReleaseArtifactMeta(context.params.artifactName);

  if (!artifact) {
    return new Response('Not found', { status: 404 });
  }

  const etag = createArtifactEtag(artifact.sizeBytes, artifact.updatedAt);
  const headers = {
    'Content-Type': artifact.contentType,
    'Cache-Control': 'no-cache',
    'Content-Disposition': `inline; filename="${artifact.fileName}"`,
    'Content-Length': String(artifact.sizeBytes),
    'Last-Modified': new Date(artifact.updatedAt).toUTCString(),
    ETag: etag,
    Vary: 'If-None-Match, If-Modified-Since',
    'X-Release-Artifact-Bytes': String(artifact.sizeBytes),
    'X-Release-Artifact-Label': artifact.label,
    'X-Release-Artifact-Path': artifact.relativePath,
    'X-Release-Artifact-Updated-At': artifact.updatedAt,
    'X-Release-Artifact-Freshness': artifact.freshness.verdict,
    'X-Release-Artifact-Age': artifact.freshness.age,
    'X-Release-Artifact-Stale-Threshold-Hours': String(artifact.freshness.staleThresholdHours),
    'X-Release-Artifact-Freshness-Reason': artifact.freshness.reason
  };

  if (requestMatchesEtag(request, etag) || requestMatchesLastModified(request, artifact.updatedAt)) {
    return new Response(null, {
      status: 304,
      headers
    });
  }

  const file = options.includeBody ? await readFile(artifact.resolvedPath) : null;

  return new Response(file, {
    headers
  });
}

export async function GET(request: Request, context: { params: { artifactName: string } }) {
  return createArtifactResponse(request, context, { includeBody: true });
}

export async function HEAD(request: Request, context: { params: { artifactName: string } }) {
  return createArtifactResponse(request, context, { includeBody: false });
}

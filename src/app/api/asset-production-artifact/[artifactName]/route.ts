import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const generatedDataDir = path.join(process.cwd(), 'data', 'generated');
const allowedArtifacts = new Map([
  ['canonical-production-next-actions.json', { contentType: 'application/json; charset=utf-8', label: 'Production next actions (JSON)' }],
  ['canonical-production-next-actions.md', { contentType: 'text/markdown; charset=utf-8', label: 'Production next actions (Markdown)' }],
  ['canonical-staged-render-handoff.json', { contentType: 'application/json; charset=utf-8', label: 'Staged render handoff (JSON)' }],
  ['canonical-staged-render-handoff.md', { contentType: 'text/markdown; charset=utf-8', label: 'Staged render handoff (Markdown)' }],
  ['canonical-image-generation-jobs.json', { contentType: 'application/json; charset=utf-8', label: 'Still image generation jobs (JSON)' }],
  ['canonical-image-generation-jobs.md', { contentType: 'text/markdown; charset=utf-8', label: 'Still image generation jobs (Markdown)' }],
  ['canonical-image-generation-results.json', { contentType: 'application/json; charset=utf-8', label: 'Still generation results (JSON)' }],
  ['canonical-still-generation-queue.json', { contentType: 'application/json; charset=utf-8', label: 'Still generation queue (JSON)' }],
  ['canonical-still-generation-queue.md', { contentType: 'text/markdown; charset=utf-8', label: 'Still generation queue (Markdown)' }],
  ['canonical-loop-generation-queue.json', { contentType: 'application/json; charset=utf-8', label: 'Loop generation queue (JSON)' }],
  ['canonical-loop-generation-queue.md', { contentType: 'text/markdown; charset=utf-8', label: 'Loop generation queue (Markdown)' }],
  ['canonical-loop-generation-results.json', { contentType: 'application/json; charset=utf-8', label: 'Loop generation results (JSON)' }],
  ['canonical-loop-render-jobs.json', { contentType: 'application/json; charset=utf-8', label: 'Loop render jobs (JSON)' }],
  ['canonical-loop-render-jobs.md', { contentType: 'text/markdown; charset=utf-8', label: 'Loop render jobs (Markdown)' }]
]);

function formatAgeFromMs(diffMs: number) {
  const totalMinutes = Math.max(0, Math.round(diffMs / 60000));
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours < 24) return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours === 0 ? `${days}d` : `${days}d ${remainingHours}h`;
}

function getArtifactStaleThresholdHours() {
  const parsed = Number(process.env.BULL_BEAR_ASSET_ARTIFACT_STALE_HOURS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 24;
}

function summarizeArtifactFreshness(mtimeMs: number) {
  const staleThresholdHours = getArtifactStaleThresholdHours();
  const ageMs = Math.max(0, Date.now() - mtimeMs);
  const staleThresholdMs = staleThresholdHours * 60 * 60 * 1000;
  const verdict = ageMs <= staleThresholdMs ? 'fresh' : 'stale';

  return {
    verdict,
    age: formatAgeFromMs(ageMs),
    staleThresholdHours,
    reason: verdict === 'fresh'
      ? `Artifact was updated within the ${staleThresholdHours}h freshness window.`
      : `Artifact is older than the ${staleThresholdHours}h freshness window.`
  };
}

function getArtifactRequestContext(context: { params: { artifactName: string } }) {
  const artifactName = context.params.artifactName;
  const artifactConfig = allowedArtifacts.get(artifactName);

  if (!artifactConfig) {
    return null;
  }

  return {
    artifactName,
    contentType: artifactConfig.contentType,
    label: artifactConfig.label,
    relativePath: path.join('data', 'generated', artifactName).replace(/\\/g, '/'),
    resolvedPath: path.join(generatedDataDir, artifactName)
  };
}

function createArtifactEtag(size: number, mtimeMs: number) {
  return `W/"${size}-${Math.trunc(mtimeMs)}"`;
}

function requestMatchesEtag(request: Request, etag: string) {
  const raw = request.headers.get('if-none-match');
  if (!raw) return false;

  return raw
    .split(',')
    .map((value) => value.trim())
    .some((value) => value === '*' || value === etag);
}

function requestMatchesLastModified(request: Request, mtimeMs: number) {
  const raw = request.headers.get('if-modified-since');
  if (!raw) return false;

  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return false;

  return Math.trunc(mtimeMs / 1000) * 1000 <= parsed;
}

async function createArtifactResponse(
  request: Request,
  context: { params: { artifactName: string } },
  options: { includeBody: boolean }
) {
  const requestContext = getArtifactRequestContext(context);

  if (!requestContext) {
    return new Response('Not found', { status: 404 });
  }

  try {
    const fileStat = await stat(requestContext.resolvedPath);
    const etag = createArtifactEtag(fileStat.size, fileStat.mtimeMs);
    const freshness = summarizeArtifactFreshness(fileStat.mtimeMs);
    const headers = {
      'Content-Type': requestContext.contentType,
      'Cache-Control': 'no-cache',
      'Content-Disposition': `inline; filename="${requestContext.artifactName}"`,
      'Content-Length': String(fileStat.size),
      'Last-Modified': fileStat.mtime.toUTCString(),
      ETag: etag,
      Vary: 'If-None-Match, If-Modified-Since',
      'X-Asset-Production-Artifact-Bytes': String(fileStat.size),
      'X-Asset-Production-Artifact-Label': requestContext.label,
      'X-Asset-Production-Artifact-Path': requestContext.relativePath,
      'X-Asset-Production-Artifact-Updated-At': fileStat.mtime.toISOString(),
      'X-Asset-Production-Artifact-Freshness': freshness.verdict,
      'X-Asset-Production-Artifact-Age': freshness.age,
      'X-Asset-Production-Artifact-Stale-Threshold-Hours': String(freshness.staleThresholdHours),
      'X-Asset-Production-Artifact-Freshness-Reason': freshness.reason
    };

    if (requestMatchesEtag(request, etag) || requestMatchesLastModified(request, fileStat.mtimeMs)) {
      return new Response(null, {
        status: 304,
        headers
      });
    }

    const file = options.includeBody ? await readFile(requestContext.resolvedPath) : null;

    return new Response(file, {
      headers
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}

export async function GET(request: Request, context: { params: { artifactName: string } }) {
  return createArtifactResponse(request, context, { includeBody: true });
}

export async function HEAD(request: Request, context: { params: { artifactName: string } }) {
  return createArtifactResponse(request, context, { includeBody: false });
}

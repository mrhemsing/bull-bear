import { getOperatorStatusSummary } from '@/lib/operator-status';

function createOperatorStatusEtag(body: string) {
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

function getOperatorStatusLastModified(summary: Awaited<ReturnType<typeof getOperatorStatusSummary>>) {
  const candidates = [
    summary.checkedAt,
    summary.latestCaptureAudit?.capturedAt,
    summary.installedCron.latestRun?.finishedAt,
    summary.installedCron.latestRun?.startedAt
  ].filter(Boolean) as string[];

  return candidates
    .map((value) => ({ value, ms: Date.parse(value) }))
    .filter((entry) => Number.isFinite(entry.ms))
    .sort((a, b) => b.ms - a.ms)[0]?.value ?? null;
}

function createOperatorStatusHeaders(
  summary: Awaited<ReturnType<typeof getOperatorStatusSummary>>,
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
    'X-Operator-Level': summary.overall.level,
    'X-Operator-Checked-At': summary.checkedAt,
    'X-Operator-Snapshot-Freshness': summary.snapshotFreshness?.verdict ?? 'unknown',
    'X-Operator-Runtime-Health': summary.runtimeHealth.level,
    'X-Operator-Installed-Cron-Matches': String(summary.installedCron.matchCount),
    'X-Operator-Installed-Cron-Duplicates': String(summary.installedCron.duplicatesDetected),
    'X-Operator-Run-Health': summary.installedCron.runHealth?.verdict ?? 'unknown',
    'X-Operator-Run-Health-Latest-At': summary.installedCron.latestRun?.startedAt ?? '',
    'X-Operator-Audit-Health': summary.auditHealth.verdict,
    'X-Operator-Audit-Latest-At': summary.latestCaptureAudit?.capturedAt ?? '',
    'X-Operator-Issue-Count': String(summary.overall.issues.length),
    'X-Operator-Warning-Count': String(summary.overall.warnings.length),
    'X-Operator-Next-Actions': String(summary.nextActions.length),
    'X-Operator-Trend-Sample-Size': String(summary.historySummary?.sampleSize ?? 0),
    'X-Operator-Trend-Entry-Count': String(summary.historySummary?.historyEntryCount ?? 0)
  };
}

async function createOperatorStatusResponse(request: Request, options: { includeBody: boolean }) {
  const summary = await getOperatorStatusSummary();
  const body = JSON.stringify(summary, null, 2);
  const etag = createOperatorStatusEtag(body);
  const lastModifiedAt = getOperatorStatusLastModified(summary);
  const headers = createOperatorStatusHeaders(summary, Buffer.byteLength(body), etag, lastModifiedAt);

  if (requestMatchesEtag(request, etag) || requestMatchesLastModified(request, lastModifiedAt)) {
    return new Response(null, { status: 304, headers });
  }

  return new Response(options.includeBody ? body : null, {
    headers
  });
}

export async function GET(request: Request) {
  return createOperatorStatusResponse(request, { includeBody: true });
}

export async function HEAD(request: Request) {
  return createOperatorStatusResponse(request, { includeBody: false });
}

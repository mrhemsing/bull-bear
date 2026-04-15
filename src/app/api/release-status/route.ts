import { getAssetProductionSummary } from '@/lib/asset-production';
import { getOperatorStatusSummary } from '@/lib/operator-status';

function formatAge(ms: number | null) {
  if (!Number.isFinite(ms) || ms === null || ms < 0) return 'unknown';
  const totalMinutes = Math.round(ms / 60000);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

function ageFromTimestamp(value: string | null | undefined) {
  if (!value || typeof value !== 'string') return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Date.now() - ms);
}

function formatWarningReasons(warnings: string[]) {
  const cleanWarnings = warnings
    .filter((warning) => typeof warning === 'string' && warning.trim().length > 0)
    .map((warning) => warning.trim().replace(/\.$/, ''));

  if (cleanWarnings.length === 0) return 'the current warning set is non-empty';
  return cleanWarnings.join('; ');
}

function summarizeOperator(operator: Awaited<ReturnType<typeof getOperatorStatusSummary>>) {
  const issues = operator.overall.issues ?? [];
  const warnings = operator.overall.warnings ?? [];
  const nextActions = operator.nextActions ?? [];
  const level = operator.overall.level ?? 'UNKNOWN';
  const snapshotFreshness = operator.snapshotFreshness?.verdict ?? 'unknown';
  const runHealth = operator.installedCron.runHealth?.verdict ?? 'unknown';
  const auditHealth = operator.auditHealth?.verdict ?? 'unknown';
  const routineOperatorLoopOnly = level === 'WATCH'
    && warnings.length > 0
    && nextActions.length === 1
    && nextActions[0]?.area === 'operator-loop'
    && snapshotFreshness === 'fresh'
    && runHealth === 'healthy'
    && auditHealth === 'fresh';

  const blockers: string[] = [];
  const cautions: string[] = [];

  if (level === 'ATTENTION') {
    blockers.push('Operator status is ATTENTION.');
  } else if (level === 'WATCH') {
    cautions.push(
      routineOperatorLoopOnly
        ? `Operator status is WATCH only because: ${formatWarningReasons(warnings)}.`
        : 'Operator status is WATCH.'
    );
  }

  if (snapshotFreshness === 'stale') {
    cautions.push('Recorded operator snapshot is stale.');
  }

  if (runHealth === 'failing' || runHealth === 'stale' || runHealth === 'no-history') {
    blockers.push(`Installed cron run health is ${runHealth}.`);
  } else if (runHealth === 'running' || runHealth === 'queued' || runHealth === 'unknown') {
    cautions.push(`Installed cron run health is ${runHealth}.`);
  }

  if (auditHealth === 'error' || auditHealth === 'missing' || auditHealth === 'stale') {
    blockers.push(`Capture audit health is ${auditHealth}.`);
  }

  return {
    level,
    snapshotFreshness,
    runHealth,
    auditHealth,
    issueCount: issues.length,
    warningCount: warnings.length,
    nextActionCount: nextActions.length,
    blockers,
    cautions,
    headline: `operator=${level} snapshot=${snapshotFreshness} run=${runHealth} audit=${auditHealth}`
  };
}

function summarizeAssets(asset: ReturnType<typeof getAssetProductionSummary>) {
  const nextActions = asset.nextActions ?? [];
  const fullCoverageComplete = Boolean(asset.fullCoverageComplete);
  const approvedStills = Number(asset.approvedStills ?? 0);
  const totalStates = Number(asset.totalStates ?? 0);
  const approvedLoops = Number(asset.approvedLoops ?? 0);
  const pendingStates = Number(asset.pendingStates ?? 0);
  const staleArtifactCount = asset.artifactEntries.filter((entry) => entry.freshness.verdict === 'stale').length;
  const imageLedgerFreshness = asset.imageGenerationSummary.freshness.verdict ?? 'unknown';
  const loopLedgerFreshness = asset.loopGenerationSummary.freshness.verdict ?? 'unknown';
  const assetWorkstreamActive = !fullCoverageComplete || pendingStates > 0 || nextActions.length > 0;

  const blockers: string[] = [];
  const cautions: string[] = [];

  if (!fullCoverageComplete) {
    blockers.push('Canonical asset coverage is incomplete.');
  }

  if (pendingStates > 0) {
    blockers.push(`${pendingStates} states are still pending asset approval.`);
  }

  if (nextActions.length > 0) {
    cautions.push(`${nextActions.length} asset-production next actions are still open.`);
  }

  if (assetWorkstreamActive && staleArtifactCount > 0) {
    cautions.push(`${staleArtifactCount} generated asset handoff artifacts are stale.`);
  }

  if (assetWorkstreamActive && (imageLedgerFreshness === 'stale' || loopLedgerFreshness === 'stale')) {
    cautions.push(`Generation ledger freshness is image=${imageLedgerFreshness}, loop=${loopLedgerFreshness}.`);
  }

  return {
    fullCoverageComplete,
    approvedStills,
    totalStates,
    approvedLoops,
    pendingStates,
    nextActionCount: nextActions.length,
    staleArtifactCount,
    imageLedgerFreshness,
    loopLedgerFreshness,
    blockers,
    cautions,
    headline: `coverage=${fullCoverageComplete ? 'complete' : 'incomplete'} stills=${approvedStills}/${totalStates} loops=${approvedLoops} pending=${pendingStates}`
  };
}

function buildReleaseSummary(operator: Awaited<ReturnType<typeof getOperatorStatusSummary>>, assets: ReturnType<typeof getAssetProductionSummary>) {
  const operatorSummary = summarizeOperator(operator);
  const assetSummary = summarizeAssets(assets);
  const blockers = [...operatorSummary.blockers, ...assetSummary.blockers];
  const cautions = [...operatorSummary.cautions, ...assetSummary.cautions];

  const verdict = blockers.length > 0 ? 'FAIL' : cautions.length > 0 ? 'WATCH' : 'PASS';

  const checkedAtCandidates = [
    operator.checkedAt,
    operator.latestCaptureAudit?.capturedAt,
    operator.installedCron.latestRun?.finishedAt,
    operator.installedCron.latestRun?.startedAt,
    assets.imageGenerationSummary.latestRecordedAt,
    assets.loopGenerationSummary.latestRecordedAt
  ].filter(Boolean) as string[];

  const newestEvidenceAt = checkedAtCandidates
    .map((value) => ({ value, ms: Date.parse(value) }))
    .filter((entry) => Number.isFinite(entry.ms))
    .sort((a, b) => b.ms - a.ms)[0]?.value ?? null;

  const activeWorkstream = assetSummary.fullCoverageComplete && assetSummary.nextActionCount === 0
    ? (operatorSummary.blockers.length > 0 || operatorSummary.cautions.length > 0
      ? 'rollout-proof-only'
      : 'complete-no-open-work')
    : 'assets-or-mixed';
  const activeWorkstreamSummary = activeWorkstream === 'rollout-proof-only'
    ? 'Asset coverage is complete and the active lane is rollout / scheduler proof only.'
    : activeWorkstream === 'complete-no-open-work'
      ? 'Asset coverage is complete and no open release lane remains.'
      : 'Asset production and/or rollout proof still have open work.';

  return {
    verdict,
    checkedAt: newestEvidenceAt ?? operator.checkedAt ?? new Date().toISOString(),
    newestEvidenceAt,
    newestEvidenceAge: newestEvidenceAt ? formatAge(ageFromTimestamp(newestEvidenceAt)) : null,
    activeWorkstream,
    activeWorkstreamSummary,
    operator: operatorSummary,
    assets: assetSummary,
    blockers,
    cautions,
    recommendedActions: [...new Set([...(operator.nextActions ?? []), ...(assets.nextActions ?? [])])].slice(0, 10)
  };
}

function createReleaseStatusEtag(body: string) {
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

function createReleaseStatusHeaders(summary: ReturnType<typeof buildReleaseSummary>, contentLength: number, etag: string) {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-cache',
    'Content-Length': String(contentLength),
    ETag: etag,
    Vary: 'If-None-Match, If-Modified-Since',
    'Last-Modified': summary.checkedAt ? new Date(summary.checkedAt).toUTCString() : '',
    'X-Release-Status-Verdict': summary.verdict,
    'X-Release-Status-Checked-At': summary.checkedAt,
    'X-Release-Status-Newest-Evidence-At': summary.newestEvidenceAt ?? '',
    'X-Release-Status-Newest-Evidence-Age': summary.newestEvidenceAge ?? 'unknown',
    'X-Release-Status-Blocker-Count': String(summary.blockers.length),
    'X-Release-Status-Caution-Count': String(summary.cautions.length),
    'X-Release-Status-Recommended-Actions': String(summary.recommendedActions.length),
    'X-Release-Status-Operator-Level': summary.operator.level,
    'X-Release-Status-Operator-Snapshot-Freshness': summary.operator.snapshotFreshness,
    'X-Release-Status-Operator-Run-Health': summary.operator.runHealth,
    'X-Release-Status-Operator-Audit-Health': summary.operator.auditHealth,
    'X-Release-Status-Asset-Full-Coverage': String(summary.assets.fullCoverageComplete),
    'X-Release-Status-Asset-Pending-States': String(summary.assets.pendingStates),
    'X-Release-Status-Asset-Stale-Artifacts': String(summary.assets.staleArtifactCount),
    'X-Release-Status-Image-Ledger-Freshness': summary.assets.imageLedgerFreshness,
    'X-Release-Status-Loop-Ledger-Freshness': summary.assets.loopLedgerFreshness
  };
}

async function createReleaseStatusResponse(request: Request, options: { includeBody: boolean }) {
  const [operator, assets] = await Promise.all([getOperatorStatusSummary(), Promise.resolve(getAssetProductionSummary())]);
  const summary = buildReleaseSummary(operator, assets);
  const body = JSON.stringify(summary, null, 2);
  const etag = createReleaseStatusEtag(body);
  const headers = createReleaseStatusHeaders(summary, Buffer.byteLength(body), etag);

  if (requestMatchesEtag(request, etag) || requestMatchesLastModified(request, summary.checkedAt)) {
    return new Response(null, { status: 304, headers });
  }

  return new Response(options.includeBody ? body : null, { headers });
}

export async function GET(request: Request) {
  return createReleaseStatusResponse(request, { includeBody: true });
}

export async function HEAD(request: Request) {
  return createReleaseStatusResponse(request, { includeBody: false });
}

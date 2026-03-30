import { getAssetProductionSummary } from '@/lib/asset-production';
import { getLiveMarketBeastState } from '@/lib/live-state';
import { getOperatorArtifactEntries } from '@/lib/operator-artifacts';
import { getOperatorStatusSummary } from '@/lib/operator-status';
import { getReleaseArtifactEntries } from '@/lib/release-artifacts';
import { DebugPanel } from './debug-panel';
import { HeroMedia } from './hero-media';
import { ReviewSelector } from './review-selector';
import { TimelineScrubber } from './timeline-scrubber';

function formatSignedNumber(value?: number, digits = 2) {
  if (value === undefined || value === null || Number.isNaN(value)) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(digits)}`;
}

function formatUsd(value?: number) {
  if (value === undefined || value === null || Number.isNaN(value)) return '—';
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatRelativeStateChange(current: number | undefined, previous: number | undefined) {
  if (!current || !previous) return 'First tracked state';
  const delta = current - previous;
  if (delta === 0) return 'No state change';
  return `${delta > 0 ? '+' : ''}${delta} vs previous transition`;
}

function getAssetPreviewSrc(assetPath: string) {
  return `/api/asset-preview/${assetPath.split(/[\\/]/).map(encodeURIComponent).join('/')}`;
}

function formatRunTimestamp(value: string | null) {
  if (!value) return 'Not run yet';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatTimeAgo(value: string | null) {
  if (!value) return 'unknown age';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'unknown age';

  const diffMs = Math.max(0, Date.now() - date.getTime());
  const totalMinutes = Math.round(diffMs / 60000);
  if (totalMinutes < 60) return `${totalMinutes}m ago`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours < 24) return minutes === 0 ? `${hours}h ago` : `${hours}h ${minutes}m ago`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours === 0 ? `${days}d ago` : `${days}d ${remainingHours}h ago`;
}

function formatStatusCounts(counts?: Record<string, number>) {
  const entries = Object.entries(counts ?? {});
  if (!entries.length) return 'No recorded entries yet';
  return entries.map(([status, count]) => `${status.replace(/-/g, ' ')} ${count}`).join(' • ');
}

function formatDurationMs(value?: number | null) {
  if (value === undefined || value === null || !Number.isFinite(value) || value < 0) return 'unknown duration';
  const totalMinutes = Math.round(value / 60000);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

function getLevelColor(level: string) {
  if (level === 'READY') return '#86efac';
  if (level === 'ATTENTION') return '#fca5a5';
  return '#fcd34d';
}

function getFreshnessColor(verdict?: string) {
  if (verdict === 'fresh') return '#86efac';
  if (verdict === 'stale') return '#fca5a5';
  return '#fcd34d';
}

function getOperatorArtifactHref(fileName: 'latest.json' | 'latest.txt' | 'latest.md' | 'history.ndjson') {
  return `/api/operator-artifact/${encodeURIComponent(fileName)}`;
}

function getOperatorStatusHref() {
  return '/api/operator-status';
}

function getOperatorArtifactStatusHref() {
  return '/api/operator-artifact-status';
}

function getAssetProductionArtifactHref(fileName: string) {
  return `/api/asset-production-artifact/${encodeURIComponent(fileName)}`;
}

function getAssetProductionStatusHref() {
  return '/api/asset-production-status';
}

function getReviewStatusHref() {
  return '/api/review-status';
}

function getReleaseStatusHref() {
  return '/api/release-status';
}

function getReleaseArtifactStatusHref() {
  return '/api/release-artifact-status';
}

function getReleaseArtifactHref(fileName: 'latest.json' | 'latest.txt' | 'latest.md' | 'history.ndjson') {
  return `/api/release-artifact/${encodeURIComponent(fileName)}`;
}

function formatTrendCounts(counts?: Record<string, number>) {
  const entries = Object.entries(counts ?? {});
  if (!entries.length) return 'No recorded trend counts yet';
  return entries.map(([level, count]) => `${level} ${count}`).join(' • ');
}

export default async function HomePage() {
  const live = await getLiveMarketBeastState();
  const assetProduction = getAssetProductionSummary();
  const operatorStatus = await getOperatorStatusSummary();
  const [operatorArtifacts, releaseArtifacts] = await Promise.all([
    getOperatorArtifactEntries(),
    getReleaseArtifactEntries()
  ]);
  const previousTransition = live.history[1] ?? null;
  const assetCoverageStatus = assetProduction.fullCoverageComplete
    ? 'All 20 stills and all 60 loops are approved in canonical runtime paths.'
    : 'This panel reads the generated asset checklist so the app reflects actual production status: approved anchors, adjacent candidate batches, untouched states still waiting for generation, and real loop coverage pulled from canonical runtime files.';

  return (
    <main style={{ padding: '24px clamp(16px, 3vw, 32px) 48px', maxWidth: 1240, margin: '0 auto' }}>
      <header style={{ marginBottom: 32 }}>
        <p style={{ textTransform: 'uppercase', letterSpacing: 2, color: '#8ea3c7', marginBottom: 8 }}>Bull Bear</p>
        <h1 style={{ margin: 0, fontSize: 'clamp(2.2rem, 5vw, 44px)', lineHeight: 1.05 }}>The Bitcoin market beast</h1>
        <p style={{ maxWidth: 800, color: '#b4bfd3', lineHeight: 1.6 }}>
          A cinematic recurring creature driven by a live composite score from Fear &amp; Greed, BTC/USD vs MA7, and BTC/USD vs MA30. The live market maps into 20 canonical beast states, while the historical timeline only records actual state transitions.
        </p>
      </header>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24, marginBottom: 28, alignItems: 'start' }}>
        <div style={{ background: '#121931', borderRadius: 20, padding: 20, border: '1px solid #24304f' }}>
          <div style={{ color: '#8ea3c7', textTransform: 'uppercase', letterSpacing: 1.5, fontSize: 12, marginBottom: 12 }}>
            Live canonical state
          </div>

          <HeroMedia
            activeLoop={live.activeLoop}
            activeStill={live.activeStill}
            stateLabel={live.snapshot.stateLabel}
            score={formatSignedNumber(live.snapshot.finalScore)}
          />

          <div style={{ color: '#c5d0e7', maxWidth: 620, lineHeight: 1.5, marginTop: 16, marginBottom: 16 }}>
            State {live.manifest?.index ?? live.snapshot.stateIndex} mapped from a live composite market score of {formatSignedNumber(live.snapshot.finalScore)}. The hero now prefers the canonical loop asset first, then falls back to the resolved still when animation is unavailable.
          </div>

          <div style={{ display: 'inline-flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
            <InlineBadge label="Still" value={live.activeStill} mono />
            <InlineBadge label="Active loop" value={live.activeLoop ?? 'Pending'} mono />
            <InlineBadge label="Asset source" value={live.assets.source} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
            <HeroChip label="Score" value={formatSignedNumber(live.snapshot.finalScore)} />
            <HeroChip label="F&G" value={String(live.snapshot.fearAndGreed)} />
            <HeroChip label="MA7" value={formatUsd(live.snapshot.ma7)} />
            <HeroChip label="MA30" value={formatUsd(live.snapshot.ma30)} />
          </div>
        </div>

        <div style={{ background: '#121931', borderRadius: 20, padding: 24, border: '1px solid #24304f' }}>
          <h2 style={{ marginTop: 0 }}>Live reading</h2>
          <Stat label="Timestamp" value={new Date(live.snapshot.timestamp).toLocaleString()} />
          <Stat label="BTC/USD price" value={formatUsd(live.snapshot.currentPrice)} />
          <Stat label="State label" value={live.snapshot.stateLabel} />
          <Stat label="State index" value={String(live.snapshot.stateIndex)} />
          <Stat label="Direction" value={live.creature.direction} />
          <Stat label="Intensity" value={`${live.creature.intensity}%`} />
          <Stat label="Resolved still" value={live.activeStill} mono />
          <Stat label="Active loop" value={live.activeLoop ?? 'Pending'} mono />
          <Stat label="Loop variants" value={live.activeLoops.join(', ') || 'Pending'} mono />
          <Stat label="Loop rotation" value={live.assets.loopVariantIndex === null ? 'Pending' : `Variant ${live.assets.loopVariantIndex + 1} of ${live.activeLoops.length}`} />
        </div>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24, marginBottom: 28 }}>
        <div style={{ background: '#121931', borderRadius: 18, padding: 18, border: '1px solid #24304f' }}>
          <div style={{ color: '#8ea3c7', textTransform: 'uppercase', letterSpacing: 1, fontSize: 12, marginBottom: 8 }}>Live signal breakdown</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
            <HeroChip label="Sentiment score" value={formatSignedNumber(live.snapshot.sentimentScore)} />
            <HeroChip label="Trend 7 score" value={formatSignedNumber(live.snapshot.trend7Score)} />
            <HeroChip label="Trend 30 score" value={formatSignedNumber(live.snapshot.trend30Score)} />
            <HeroChip label="Source" value="BTC/USD" />
          </div>
        </div>

        <div style={{ background: '#121931', borderRadius: 18, padding: 18, border: '1px solid #24304f' }}>
          <div style={{ color: '#8ea3c7', textTransform: 'uppercase', letterSpacing: 1, fontSize: 12, marginBottom: 8 }}>Transition memory</div>
          <div style={{ display: 'grid', gap: 12 }}>
            <TimelineMetric label="Latest saved transition" value={live.latestTransition ? new Date(live.latestTransition.timestamp).toLocaleString() : 'None yet'} />
            <TimelineMetric label="Transition delta" value={formatRelativeStateChange(live.latestTransition?.stateIndex, previousTransition?.stateIndex)} />
            <TimelineMetric label="Saved transition count" value={String(live.history.length)} />
            <TimelineMetric label="Persistence rule" value="Only when canonical state changes" />
          </div>
        </div>

        <div style={{ background: '#121931', borderRadius: 18, padding: 18, border: '1px solid #24304f' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
            <div style={{ color: '#8ea3c7', textTransform: 'uppercase', letterSpacing: 1, fontSize: 12 }}>Operator release snapshot</div>
            <div style={{ color: getLevelColor(operatorStatus.overall.level), fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>
              {operatorStatus.overall.level}
            </div>
          </div>
          <div style={{ color: '#b4bfd3', lineHeight: 1.6, marginBottom: 14 }}>
            Recorded from <span style={{ fontFamily: 'Consolas, monospace' }}>{formatRunTimestamp(operatorStatus.checkedAt)}</span>. This mirrors the latest saved operator proof so release readiness is visible in-product, not only from CLI output.
          </div>
          <div style={{ borderRadius: 12, padding: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid #2b3655', marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
              <div style={{ fontWeight: 700 }}>Recorded snapshot freshness</div>
              <div style={{ color: getFreshnessColor(operatorStatus.snapshotFreshness?.verdict), fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>
                {operatorStatus.snapshotFreshness?.verdict ?? 'unknown'}
              </div>
            </div>
            <div style={{ color: '#b4bfd3', lineHeight: 1.5 }}>
              {operatorStatus.snapshotFreshness?.reason ?? 'Recorded operator snapshot freshness is unavailable.'}
              {operatorStatus.snapshotFreshness?.age ? ` • age ${operatorStatus.snapshotFreshness.age}` : ''}
              {operatorStatus.snapshotFreshness?.staleThresholdHours ? ` • threshold ${operatorStatus.snapshotFreshness.staleThresholdHours}h` : ''}
            </div>
          </div>
          <div style={{ display: 'grid', gap: 12, marginBottom: 14 }}>
            <TimelineMetric label="Runtime health" value={`${operatorStatus.runtimeHealth.level} — ${operatorStatus.runtimeHealth.summary}`} />
            <TimelineMetric label="Installed cron" value={`${operatorStatus.installedCron.matchCount} match${operatorStatus.installedCron.matchCount === 1 ? '' : 'es'}${operatorStatus.installedCron.duplicatesDetected ? ' • duplicates detected' : ''}`} />
            <TimelineMetric label="Run health" value={`${operatorStatus.installedCron.runHealth?.verdict ?? 'unknown'}${operatorStatus.installedCron.runHealth?.reason ? ` — ${operatorStatus.installedCron.runHealth.reason}` : ''}${operatorStatus.installedCron.runHealth?.latestRunAge ? ` • age ${operatorStatus.installedCron.runHealth.latestRunAge}` : ''}${operatorStatus.installedCron.runHealth?.staleThresholdHours ? ` • threshold ${operatorStatus.installedCron.runHealth.staleThresholdHours}h` : ''}`} />
            <TimelineMetric label="Capture audit" value={`${operatorStatus.auditHealth.verdict} — ${operatorStatus.auditHealth.reason}${operatorStatus.auditHealth.age ? ` • age ${operatorStatus.auditHealth.age}` : ''}${operatorStatus.auditHealth.staleThresholdHours ? ` • threshold ${operatorStatus.auditHealth.staleThresholdHours}h` : ''}`} />
            <TimelineMetric
              label="Trend vs previous snapshot"
              value={operatorStatus.historySummary?.previousLevel
                ? `${operatorStatus.historySummary.levelChanged ? `${operatorStatus.historySummary.previousLevel} → ${operatorStatus.overall.level}` : `unchanged at ${operatorStatus.overall.level}`}`
                : 'First recorded snapshot'}
            />
          </div>
          {operatorStatus.latestCaptureAudit ? (
            <div style={{ borderRadius: 12, padding: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid #2b3655', marginBottom: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Latest capture proof</div>
              <div style={{ color: '#b4bfd3', lineHeight: 1.5 }}>
                {formatRunTimestamp(operatorStatus.latestCaptureAudit.capturedAt ?? null)}{operatorStatus.auditHealth.age ? ` • age ${operatorStatus.auditHealth.age}` : ''} • HTTP {operatorStatus.latestCaptureAudit.httpStatus ?? 'unknown'} • audit {operatorStatus.latestCaptureAudit.ok === true ? 'ok' : operatorStatus.latestCaptureAudit.ok === false ? 'failed' : 'unknown'} • {operatorStatus.latestCaptureAudit.stateId ?? 'unknown state'} {operatorStatus.latestCaptureAudit.stateLabel ? `(${operatorStatus.latestCaptureAudit.stateLabel})` : ''} • provider {operatorStatus.latestCaptureAudit.provider ?? 'unknown'} • shouldPersist={String(operatorStatus.latestCaptureAudit.shouldPersist ?? 'unknown')}
                {operatorStatus.latestCaptureAudit.error ? ` • error: ${operatorStatus.latestCaptureAudit.error}` : ''}
              </div>
            </div>
          ) : null}
          {operatorStatus.installedCron.latestRun ? (
            <div style={{ borderRadius: 12, padding: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid #2b3655', marginBottom: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Latest installed scheduler run</div>
              <div style={{ color: '#b4bfd3', lineHeight: 1.5 }}>
                {operatorStatus.installedCron.latestRun.status ?? 'unknown'} @ {formatRunTimestamp(operatorStatus.installedCron.latestRun.startedAt ?? null)}{operatorStatus.installedCron.latestRun.finishedAt ? ` • finished ${formatRunTimestamp(operatorStatus.installedCron.latestRun.finishedAt)}` : ''}{operatorStatus.installedCron.latestRun.durationMs !== undefined && operatorStatus.installedCron.latestRun.durationMs !== null ? ` • duration ${formatDurationMs(operatorStatus.installedCron.latestRun.durationMs)}` : ''}{operatorStatus.installedCron.runHealth?.latestRunAge ? ` • age ${operatorStatus.installedCron.runHealth.latestRunAge}` : ''}
                {operatorStatus.installedCron.latestRun.text ? ` — ${operatorStatus.installedCron.latestRun.text}` : ''}
              </div>
            </div>
          ) : null}
          {operatorStatus.historySummary?.recentLevels?.length ? (
            <div style={{ borderRadius: 12, padding: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid #2b3655', marginBottom: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Recent recorded trend</div>
              <div style={{ color: '#b4bfd3', lineHeight: 1.5, marginBottom: 8 }}>
                {operatorStatus.historySummary.recentLevels.map((entry) => `${entry.level}${entry.checkedAt ? ` @ ${formatRunTimestamp(entry.checkedAt)}` : ''}`).join(' → ')}
              </div>
              <div style={{ color: '#8ea3c7', lineHeight: 1.5, marginBottom: 6 }}>
                Recent level counts: {formatTrendCounts(operatorStatus.historySummary.recentLevelCounts)}
              </div>
              <div style={{ color: '#8ea3c7', lineHeight: 1.5 }}>
                Current streak: {operatorStatus.historySummary.currentStreak?.count
                  ? `${operatorStatus.historySummary.currentStreak.level} × ${operatorStatus.historySummary.currentStreak.count}${operatorStatus.historySummary.currentStreak.sinceCheckedAt ? ` since ${formatRunTimestamp(operatorStatus.historySummary.currentStreak.sinceCheckedAt)}` : ''}`
                  : 'No streak recorded yet'}
              </div>
            </div>
          ) : null}
          {(operatorStatus.overall.issues.length || operatorStatus.overall.warnings.length) ? (
            <div style={{ borderRadius: 12, padding: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid #2b3655', marginBottom: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Recorded issues and warnings</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {operatorStatus.overall.issues.map((issue) => (
                  <div key={`issue-${issue}`} style={{ color: '#fecaca', lineHeight: 1.5 }}>Issue: {issue}</div>
                ))}
                {operatorStatus.overall.warnings.map((warning) => (
                  <div key={`warning-${warning}`} style={{ color: '#fde68a', lineHeight: 1.5 }}>Warning: {warning}</div>
                ))}
              </div>
            </div>
          ) : null}
          {operatorStatus.artifactPaths ? (
            <div style={{ borderRadius: 12, padding: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid #2b3655', marginBottom: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Recorded handoff artifacts</div>
              <div style={{ color: '#b4bfd3', lineHeight: 1.5, marginBottom: 10 }}>
                Open the latest saved operator proof directly from the app: JSON for automation, text for terminal-style review, Markdown for paste-ready handoffs, and the NDJSON history log for full trend/audit review.
              </div>
              <div style={{ marginBottom: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <a href={getOperatorStatusHref()} target="_blank" rel="noreferrer" style={{ color: '#7dd3fc', textDecoration: 'none', border: '1px solid #2b3655', borderRadius: 999, padding: '8px 12px', display: 'inline-flex' }}>
                  Open operator status summary JSON
                </a>
                <a href={getOperatorArtifactStatusHref()} target="_blank" rel="noreferrer" style={{ color: '#7dd3fc', textDecoration: 'none', border: '1px solid #2b3655', borderRadius: 999, padding: '8px 12px', display: 'inline-flex' }}>
                  Open operator artifact summary JSON
                </a>
                <a href={getReleaseStatusHref()} target="_blank" rel="noreferrer" style={{ color: '#7dd3fc', textDecoration: 'none', border: '1px solid #2b3655', borderRadius: 999, padding: '8px 12px', display: 'inline-flex' }}>
                  Open release status summary JSON
                </a>
                <a href={getReleaseArtifactStatusHref()} target="_blank" rel="noreferrer" style={{ color: '#7dd3fc', textDecoration: 'none', border: '1px solid #2b3655', borderRadius: 999, padding: '8px 12px', display: 'inline-flex' }}>
                  Open release artifact summary JSON
                </a>
              </div>
              <div style={{ borderRadius: 12, padding: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid #2b3655', marginBottom: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>Recorded release handoff artifacts</div>
                <div style={{ color: '#b4bfd3', lineHeight: 1.5, marginBottom: 10 }}>
                  Open the saved combined release verdict directly from the app: JSON for automation, text for terminal-style review, Markdown for paste-ready handoffs, and the NDJSON history log for rollout trend tracking. Each saved proof file now also shows its freshness, age, and threshold before you trust it.
                </div>
                <div style={{ display: 'grid', gap: 10 }}>
                  {releaseArtifacts.map((artifact) => (
                    <div key={artifact.fileName} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center', border: '1px solid #2b3655', borderRadius: 12, padding: '10px 12px' }}>
                      <div style={{ color: '#b4bfd3', lineHeight: 1.5 }}>
                        <div style={{ color: '#e5ecf7', fontWeight: 700 }}>{artifact.fileName}</div>
                        <div>{artifact.sizeHuman} • updated {formatRunTimestamp(artifact.updatedAt)}</div>
                        <div style={{ color: getFreshnessColor(artifact.freshness.verdict), fontSize: 12 }}>
                          {artifact.freshness.verdict} • age {artifact.freshness.age} • threshold {artifact.freshness.staleThresholdHours}h
                        </div>
                        <div style={{ color: '#8ea3c7', fontSize: 12, fontFamily: 'Consolas, monospace', wordBreak: 'break-word' }}>{artifact.relativePath}</div>
                      </div>
                      <a href={getReleaseArtifactHref(artifact.fileName)} target="_blank" rel="noreferrer" style={{ color: '#7dd3fc', textDecoration: 'none', border: '1px solid #2b3655', borderRadius: 999, padding: '8px 12px' }}>Open</a>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                {operatorArtifacts.map((artifact) => (
                  <div key={artifact.fileName} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center', border: '1px solid #2b3655', borderRadius: 12, padding: '10px 12px' }}>
                    <div style={{ color: '#b4bfd3', lineHeight: 1.5 }}>
                      <div style={{ color: '#e5ecf7', fontWeight: 700 }}>{artifact.fileName}</div>
                      <div>{artifact.sizeHuman} • updated {formatRunTimestamp(artifact.updatedAt)}</div>
                      <div style={{ color: getFreshnessColor(artifact.freshness.verdict), fontSize: 12 }}>
                        {artifact.freshness.verdict} • age {artifact.freshness.age} • threshold {artifact.freshness.staleThresholdHours}h
                      </div>
                      <div style={{ color: '#8ea3c7', fontSize: 12, fontFamily: 'Consolas, monospace', wordBreak: 'break-word' }}>{artifact.relativePath}</div>
                    </div>
                    <a href={getOperatorArtifactHref(artifact.fileName)} target="_blank" rel="noreferrer" style={{ color: '#7dd3fc', textDecoration: 'none', border: '1px solid #2b3655', borderRadius: 999, padding: '8px 12px' }}>Open</a>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <div style={{ display: 'grid', gap: 10 }}>
            {operatorStatus.nextActions.slice(0, 3).map((action) => (
              <div key={`${action.area}-${action.command}`} style={{ borderRadius: 12, padding: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid #2b3655' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ fontWeight: 700 }}>{action.reason}</div>
                  <div style={{ color: action.priority === 'high' ? '#fca5a5' : action.priority === 'medium' ? '#fcd34d' : '#86efac', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
                    {action.priority}
                  </div>
                </div>
                <div style={{ color: '#7dd3fc', marginTop: 8, fontSize: 13, fontFamily: 'Consolas, monospace', wordBreak: 'break-word' }}>{action.command}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ background: '#121931', borderRadius: 20, padding: 24, border: '1px solid #24304f', marginBottom: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
          <div>
            <div style={{ color: '#8ea3c7', textTransform: 'uppercase', letterSpacing: 1.4, fontSize: 12, marginBottom: 8 }}>Canonical asset production</div>
            <h2 style={{ margin: 0 }}>Real asset progress</h2>
          </div>
          <div style={{ color: '#b4bfd3', maxWidth: 560, lineHeight: 1.5 }}>
            {assetCoverageStatus}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 18 }}>
          <HeroChip label="Approved stills" value={`${assetProduction.approvedStills}/${assetProduction.totalStates}`} />
          <HeroChip label="Review states" value={String(assetProduction.candidateStates)} />
          <HeroChip label="Candidate images" value={String(assetProduction.totalCandidateImages)} />
          <HeroChip label="Loop-ready states" value={String(assetProduction.readyForLoopGeneration)} />
          <HeroChip label="Approved loops" value={String(assetProduction.approvedLoops)} />
          <HeroChip label="Loop targets queued" value={String(assetProduction.readyLoopTargets)} />
          <HeroChip label="Production actions" value={String(assetProduction.nextActions.length)} />
          <HeroChip label="Staged handoffs" value={String(assetProduction.stagedRenderHandoff.length)} />
          <HeroChip label="Image edit jobs" value={String(assetProduction.imageGenerationJobs.length)} />
          <HeroChip label="Image job results" value={String(assetProduction.imageGenerationResults.length)} />
          <HeroChip label="Image auth blockers" value={String(assetProduction.imageGenerationBlockedCount)} />
          <HeroChip label="Last still run" value={formatRunTimestamp(assetProduction.latestImageGenerationRecordedAt)} />
          <HeroChip label="Loop job results" value={String(assetProduction.loopGenerationResults.length)} />
          <HeroChip label="Loop auth blockers" value={String(assetProduction.loopGenerationBlockedCount)} />
          <HeroChip label="Last loop run" value={formatRunTimestamp(assetProduction.latestLoopGenerationRecordedAt)} />
          <HeroChip label="Contiguous lock" value={assetProduction.activeRange?.label ?? 'None yet'} />
          <HeroChip label="Untouched states" value={String(assetProduction.pendingStates)} />
        </div>

        {assetProduction.fullCoverageComplete ? (
          <div style={{ marginBottom: 18, padding: 16, borderRadius: 16, background: 'rgba(134,239,172,0.08)', border: '1px solid rgba(134,239,172,0.35)', color: '#d1fae5' }}>
            Bull Bear is now at full canonical coverage: 20 approved stills, 60 approved loops, zero queued production actions, and a clean generated handoff. The remaining work is polish, release prep, and future creative iteration — not missing core asset coverage.
          </div>
        ) : null}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18 }}>
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid #2b3655', borderRadius: 16, padding: 16 }}>
            <h3 style={{ marginTop: 0 }}>Approved anchors</h3>
            <div style={{ display: 'grid', gap: 12 }}>
              {assetProduction.approvedStates.map((state) => (
                <div key={state.id} style={{ borderRadius: 12, padding: 12, background: 'rgba(255,255,255,0.03)' }}>
                  <img
                    src={getAssetPreviewSrc(state.sourceFile)}
                    alt={`Approved anchor preview for ${state.label}`}
                    style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', borderRadius: 10, border: '1px solid #2b3655', marginBottom: 12, background: '#0b1020' }}
                  />
                  <div style={{ fontWeight: 700 }}>State {state.index} — {state.label}</div>
                  <div style={{ color: '#8ea3c7', marginTop: 6, fontFamily: 'Consolas, monospace', wordBreak: 'break-word' }}>{state.sourceFile}</div>
                  <div style={{ color: '#7dd3fc', marginTop: 6, fontSize: 13, fontFamily: 'Consolas, monospace', wordBreak: 'break-word' }}>Canonical target → {state.canonicalTarget}</div>
                  {state.notes ? <div style={{ color: '#b4bfd3', marginTop: 8, lineHeight: 1.5 }}>{state.notes}</div> : null}
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid #2b3655', borderRadius: 16, padding: 16 }}>
            <h3 style={{ marginTop: 0 }}>Review queue</h3>
            <div style={{ borderRadius: 12, padding: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid #2b3655', marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
                <div style={{ color: '#8ea3c7', textTransform: 'uppercase', letterSpacing: 1, fontSize: 12 }}>Review source completeness</div>
                <div style={{ color: assetProduction.reviewSourceAllPresent ? '#86efac' : '#fca5a5', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>
                  {assetProduction.reviewSourceAllPresent ? 'all present' : 'missing inputs'}
                </div>
              </div>
              <div style={{ color: '#b4bfd3', lineHeight: 1.6, marginBottom: 8 }}>
                {assetProduction.reviewSourceAllPresent
                  ? `All ${assetProduction.reviewSourceExpectedCount} generated review-workflow source files are present, so the queue, checklist, next-actions, and still/loop frontier exports are all available to the review flow.`
                  : `${assetProduction.reviewSourceMissingCount} of ${assetProduction.reviewSourceExpectedCount} generated review-workflow source files are missing, so the review queue summary should not be trusted as complete until those exports are regenerated.`}
              </div>
              <div style={{ color: '#8ea3c7', fontSize: 13, marginBottom: 6 }}>
                Latest review input update: <span style={{ fontFamily: 'Consolas, monospace' }}>{formatRunTimestamp(assetProduction.reviewSourceLatestUpdatedAt)}</span>
              </div>
              <div style={{ color: '#8ea3c7', fontSize: 13, fontFamily: 'Consolas, monospace', wordBreak: 'break-word' }}>
                Expected → {assetProduction.reviewSourceExpectedFiles.join(', ')}
              </div>
              <div style={{ color: assetProduction.reviewSourceMissingFiles.length ? '#fca5a5' : '#86efac', fontSize: 13, fontFamily: 'Consolas, monospace', wordBreak: 'break-word', marginTop: 6 }}>
                Missing → {assetProduction.reviewSourceMissingFiles.length ? assetProduction.reviewSourceMissingFiles.join(', ') : 'none'}
              </div>
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              {assetProduction.candidateStatesList.map((state) => (
                <div key={state.id} style={{ borderRadius: 12, padding: 12, background: 'rgba(255,255,255,0.03)' }}>
                  <div style={{ fontWeight: 700 }}>State {state.index} — {state.label}</div>
                  <div style={{ color: '#8ea3c7', marginTop: 6 }}>{state.candidateFiles.length} candidates from {state.sourceDir}</div>
                  <div style={{ color: '#7dd3fc', marginTop: 6, fontSize: 13, fontFamily: 'Consolas, monospace', wordBreak: 'break-word' }}>Winner promotes to → {state.canonicalTarget}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginTop: 12 }}>
                    {state.candidateFiles.map((file) => {
                      const filePath = `${state.sourceDir}/${file}`;
                      return (
                        <div key={file} style={{ display: 'grid', gap: 8 }}>
                          <img
                            src={getAssetPreviewSrc(filePath)}
                            alt={`${state.label} candidate ${file}`}
                            style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', borderRadius: 10, border: '1px solid #2b3655', background: '#0b1020' }}
                          />
                          <div style={{ color: '#b4bfd3', fontSize: 12, fontFamily: 'Consolas, monospace', wordBreak: 'break-word' }}>{file}</div>
                        </div>
                      );
                    })}
                  </div>
                  <ReviewSelector stateId={state.id} candidateFiles={state.candidateFiles} />
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid #2b3655', borderRadius: 16, padding: 16 }}>
            <h3 style={{ marginTop: 0 }}>Next production pass</h3>

            <div style={{ borderRadius: 12, padding: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid #2b3655', marginBottom: 16 }}>
              <div style={{ color: '#8ea3c7', textTransform: 'uppercase', letterSpacing: 1, fontSize: 12, marginBottom: 8 }}>Adjacent expansion frontier</div>
              <div style={{ color: '#b4bfd3', lineHeight: 1.6, marginBottom: assetProduction.frontierStates.length ? 12 : 0 }}>
                {assetProduction.activeRange
                  ? `The currently approved contiguous run is ${assetProduction.activeRange.label}. Finish any in-review edges, then push outward from there.`
                  : 'Approve at least one state to unlock the outward expansion plan.'}
              </div>
              {assetProduction.stillQueue.length ? (
                <div style={{ color: '#7dd3fc', marginBottom: 12, fontSize: 13 }}>
                  Exact frontier render queue exported from <span style={{ fontFamily: 'Consolas, monospace' }}>data/generated/canonical-still-generation-queue.json</span>.
                </div>
              ) : null}
              <div style={{ display: 'grid', gap: 10 }}>
                {assetProduction.frontierStates.map((state) => (
                  <div key={state.id} style={{ borderRadius: 12, padding: 12, background: 'rgba(255,255,255,0.03)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ fontWeight: 700 }}>State {state.index} — {state.label}</div>
                      <div style={{ color: state.status === 'approved' ? '#86efac' : state.status === 'in-review' ? '#fcd34d' : '#7dd3fc', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
                        {state.status.replace(/-/g, ' ')}
                      </div>
                    </div>
                    <div style={{ color: '#b4bfd3', marginTop: 8, lineHeight: 1.5 }}>{state.reason}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
              {assetProduction.reviewQueue.map((item) => (
                <div key={item.stateId} style={{ borderRadius: 12, padding: 12, background: 'rgba(255,255,255,0.03)' }}>
                  <div style={{ fontWeight: 700 }}>{item.stateId} — {item.label}</div>
                  <div style={{ color: '#8ea3c7', marginTop: 6 }}>{item.reviewType === 'approved-anchor' ? 'Approved anchor locked' : 'Awaiting winner selection'}</div>
                  <div style={{ color: '#b4bfd3', marginTop: 8, lineHeight: 1.5 }}>
                    {item.selectedFile ? `Selected: ${item.selectedFile}` : `${item.candidateFiles.length} candidates ready for review from ${item.sourceDir}.`}
                  </div>
                  <div style={{ color: '#7dd3fc', marginTop: 8, fontSize: 13, fontFamily: 'Consolas, monospace', wordBreak: 'break-word' }}>
                    Promote winner to {item.canonicalTarget}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ borderRadius: 12, padding: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid #2b3655', marginBottom: 16 }}>
              <div style={{ color: '#8ea3c7', textTransform: 'uppercase', letterSpacing: 1, fontSize: 12, marginBottom: 8 }}>Still generation frontier</div>
              <div style={{ color: '#b4bfd3', lineHeight: 1.6, marginBottom: assetProduction.stillQueuePreview.length ? 12 : 0 }}>
                {assetProduction.stillQueue.length
                  ? 'These are the next outward still batches to generate, with the adjacent locked state called out as the identity bridge.'
                  : 'No still frontier is unlocked yet — approve a contiguous run around the anchor first.'}
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                {assetProduction.stillQueuePreview.map((item) => (
                  <div key={item.stateId} style={{ borderRadius: 12, padding: 12, background: 'rgba(255,255,255,0.03)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ fontWeight: 700 }}>State {item.stateIndex} — {item.label}</div>
                      <div style={{ color: item.direction === 'bearish-expansion' ? '#fca5a5' : '#86efac', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
                        {item.direction.replace(/-/g, ' ')}
                      </div>
                    </div>
                    <div style={{ color: '#b4bfd3', marginTop: 8, lineHeight: 1.5 }}>{item.notes}</div>
                    <div style={{ color: '#8ea3c7', marginTop: 8, fontSize: 13, fontFamily: 'Consolas, monospace', wordBreak: 'break-word' }}>Reference state → {item.referenceStateId ?? '—'}</div>
                    <div style={{ color: '#8ea3c7', marginTop: 6, fontSize: 13, fontFamily: 'Consolas, monospace', wordBreak: 'break-word' }}>Output dir → {item.outputDir}</div>
                    <div style={{ color: '#7dd3fc', marginTop: 6, fontSize: 13, fontFamily: 'Consolas, monospace', wordBreak: 'break-word' }}>Canonical target → {item.stillTarget}</div>
                  </div>
                ))}
              </div>
              {assetProduction.stillQueue.length > assetProduction.stillQueuePreview.length ? (
                <div style={{ color: '#8ea3c7', marginTop: 10, fontSize: 13 }}>
                  +{assetProduction.stillQueue.length - assetProduction.stillQueuePreview.length} more queued still targets in <span style={{ fontFamily: 'Consolas, monospace' }}>data/generated/canonical-still-generation-queue.json</span>
                </div>
              ) : null}
            </div>

            <div style={{ borderRadius: 12, padding: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid #2b3655', marginBottom: 16 }}>
              <div style={{ color: '#8ea3c7', textTransform: 'uppercase', letterSpacing: 1, fontSize: 12, marginBottom: 8 }}>Image edit requests</div>
              <div style={{ color: '#b4bfd3', lineHeight: 1.6, marginBottom: assetProduction.imageGenerationJobsPreview.length ? 12 : 0 }}>
                {assetProduction.imageGenerationJobs.length
                  ? 'Frontier still renders now ship with provider-ready image-edit requests, so the next manual step is no longer prompt assembly — it is simply running the queued jobs.'
                  : 'No provider-ready image-edit requests are exported yet — approve a contiguous run around the anchor first.'}
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                {assetProduction.imageGenerationJobsPreview.map((item) => (
                  <div key={item.stateId} style={{ borderRadius: 12, padding: 12, background: 'rgba(255,255,255,0.03)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ fontWeight: 700 }}>State {item.stateIndex} — {item.label}</div>
                      <div style={{ color: '#fcd34d', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
                        {item.model}
                      </div>
                    </div>
                    <div style={{ color: '#b4bfd3', marginTop: 8, lineHeight: 1.5 }}>{item.notes}</div>
                    <div style={{ color: '#8ea3c7', marginTop: 8, fontSize: 13, fontFamily: 'Consolas, monospace', wordBreak: 'break-word' }}>Reference image → {item.image ?? '—'}</div>
                    <div style={{ color: '#8ea3c7', marginTop: 6, fontSize: 13, fontFamily: 'Consolas, monospace', wordBreak: 'break-word' }}>Output dir → {item.outputDir}</div>
                    <div style={{ color: '#8ea3c7', marginTop: 6, fontSize: 13, fontFamily: 'Consolas, monospace', wordBreak: 'break-word' }}>Prompt file → {item.renderPromptPath}</div>
                    <div style={{ color: '#7dd3fc', marginTop: 6, fontSize: 13, fontFamily: 'Consolas, monospace', wordBreak: 'break-word' }}>Canonical target → {item.canonicalTarget}</div>
                  </div>
                ))}
              </div>
              {assetProduction.imageGenerationJobs.length > assetProduction.imageGenerationJobsPreview.length ? (
                <div style={{ color: '#8ea3c7', marginTop: 10, fontSize: 13 }}>
                  +{assetProduction.imageGenerationJobs.length - assetProduction.imageGenerationJobsPreview.length} more provider-ready still jobs in <span style={{ fontFamily: 'Consolas, monospace' }}>data/generated/canonical-image-generation-jobs.json</span>
                </div>
              ) : null}
            </div>

            <div style={{ borderRadius: 12, padding: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid #2b3655', marginBottom: 16 }}>
              <div style={{ color: '#8ea3c7', textTransform: 'uppercase', letterSpacing: 1, fontSize: 12, marginBottom: 8 }}>Image generation execution report</div>
              <div style={{ color: '#b4bfd3', lineHeight: 1.6, marginBottom: assetProduction.imageGenerationResultsPreview.length ? 12 : 0 }}>
                {assetProduction.imageGenerationResults.length
                  ? assetProduction.imageGenerationBlockedCount
                    ? 'The still runner has already written a real execution report. Right now the frontier pass is blocked by missing OpenAI auth, and the blocker is visible here instead of being hidden in a CLI-only log.'
                    : assetProduction.imageGenerationGeneratedCount
                      ? 'The still runner has executed and written generated frontier candidates. Review those outputs here before promoting new canonical winners.'
                      : 'The still runner has executed in dry-run mode, so the queued frontier jobs are verified without pretending new assets shipped.'
                  : 'No still-generation execution report exists yet — run npm run generate:stills to create one.'}
              </div>
              <div style={{ color: '#8ea3c7', marginBottom: 8, fontSize: 13 }}>
                Latest recorded still run: <span style={{ fontFamily: 'Consolas, monospace' }}>{formatRunTimestamp(assetProduction.latestImageGenerationRecordedAt)}</span> • age {assetProduction.imageGenerationSummary.freshness.age ?? formatTimeAgo(assetProduction.latestImageGenerationRecordedAt)}
              </div>
              <div style={{ color: getFreshnessColor(assetProduction.imageGenerationSummary.freshness.verdict), marginBottom: 8, fontSize: 13 }}>
                Ledger freshness: {assetProduction.imageGenerationSummary.freshness.verdict} • {assetProduction.imageGenerationSummary.freshness.reason}
                {assetProduction.imageGenerationSummary.freshness.staleThresholdHours ? ` • threshold ${assetProduction.imageGenerationSummary.freshness.staleThresholdHours}h` : ''}
              </div>
              <div style={{ color: '#8ea3c7', marginBottom: 12, fontSize: 13 }}>
                Ledger status mix: {formatStatusCounts(assetProduction.imageGenerationSummary.statusCounts)}
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                {assetProduction.imageGenerationResultsPreview.map((item) => (
                  <div key={`${item.stateId}-${item.status}`} style={{ borderRadius: 12, padding: 12, background: 'rgba(255,255,255,0.03)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ fontWeight: 700 }}>State {item.stateIndex} — {item.stateId}</div>
                      <div style={{ color: item.status === 'generated' ? '#86efac' : item.status === 'blocked-missing-openai-api-key' ? '#fca5a5' : '#fcd34d', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
                        {item.status.replace(/-/g, ' ')}
                      </div>
                    </div>
                    <div style={{ color: '#b4bfd3', marginTop: 8, lineHeight: 1.5 }}>{item.notes}</div>
                    <div style={{ color: '#8ea3c7', marginTop: 8, fontSize: 13, fontFamily: 'Consolas, monospace', wordBreak: 'break-word' }}>Reference image → {item.image ?? '—'}</div>
                    <div style={{ color: '#8ea3c7', marginTop: 6, fontSize: 13, fontFamily: 'Consolas, monospace', wordBreak: 'break-word' }}>Output dir → {item.outputDir}</div>
                    {item.outputs?.length ? (
                      <div style={{ color: '#7dd3fc', marginTop: 6, fontSize: 13, fontFamily: 'Consolas, monospace', wordBreak: 'break-word' }}>Generated outputs → {item.outputs.join(', ')}</div>
                    ) : item.suggestedOutputs?.length ? (
                      <div style={{ color: '#7dd3fc', marginTop: 6, fontSize: 13, fontFamily: 'Consolas, monospace', wordBreak: 'break-word' }}>Expected outputs → {item.suggestedOutputs.join(', ')}</div>
                    ) : null}
                  </div>
                ))}
              </div>
              {assetProduction.imageGenerationResults.length > assetProduction.imageGenerationResultsPreview.length ? (
                <div style={{ color: '#8ea3c7', marginTop: 10, fontSize: 13 }}>
                  +{assetProduction.imageGenerationResults.length - assetProduction.imageGenerationResultsPreview.length} more execution entries in <span style={{ fontFamily: 'Consolas, monospace' }}>data/generated/canonical-image-generation-results.json</span>
                </div>
              ) : null}
            </div>

            <div style={{ borderRadius: 12, padding: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid #2b3655', marginBottom: 16 }}>
              <div style={{ color: '#8ea3c7', textTransform: 'uppercase', letterSpacing: 1, fontSize: 12, marginBottom: 8 }}>Loop generation execution report</div>
              <div style={{ color: '#b4bfd3', lineHeight: 1.6, marginBottom: assetProduction.loopGenerationResultsPreview.length ? 12 : 0 }}>
                {assetProduction.loopGenerationResults.length
                  ? assetProduction.loopGenerationBlockedCount
                    ? 'The loop runner now writes a real execution report too. Right now loop generation is blocked by missing fal.ai auth, and that blocker is visible here in-app instead of being hidden in a CLI log.'
                    : assetProduction.loopGenerationImplementationPendingCount
                      ? 'Loop execution was invoked with auth available, but the provider-send path is still pending, so the staged handoff remains the source of truth for actual renders.'
                      : assetProduction.loopGenerationGeneratedCount
                        ? 'The loop runner has executed real provider jobs and recorded generated MP4 outputs, so this report now doubles as shipped production proof instead of just a dry-run ledger.'
                        : 'The loop runner has executed in dry-run mode, so the queued loop jobs are verified without pretending new video assets shipped.'
                  : 'No loop-generation execution report exists yet — run npm run generate:loops to create one.'}
              </div>
              <div style={{ color: '#8ea3c7', marginBottom: 8, fontSize: 13 }}>
                Latest recorded loop run: <span style={{ fontFamily: 'Consolas, monospace' }}>{formatRunTimestamp(assetProduction.latestLoopGenerationRecordedAt)}</span> • age {assetProduction.loopGenerationSummary.freshness.age ?? formatTimeAgo(assetProduction.latestLoopGenerationRecordedAt)}
              </div>
              <div style={{ color: getFreshnessColor(assetProduction.loopGenerationSummary.freshness.verdict), marginBottom: 8, fontSize: 13 }}>
                Ledger freshness: {assetProduction.loopGenerationSummary.freshness.verdict} • {assetProduction.loopGenerationSummary.freshness.reason}
                {assetProduction.loopGenerationSummary.freshness.staleThresholdHours ? ` • threshold ${assetProduction.loopGenerationSummary.freshness.staleThresholdHours}h` : ''}
              </div>
              <div style={{ color: '#8ea3c7', marginBottom: 12, fontSize: 13 }}>
                Ledger status mix: {formatStatusCounts(assetProduction.loopGenerationSummary.statusCounts)}
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                {assetProduction.loopGenerationResultsPreview.map((item) => (
                  <div key={`${item.stateId}-${item.variant}-${item.status}`} style={{ borderRadius: 12, padding: 12, background: 'rgba(255,255,255,0.03)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ fontWeight: 700 }}>State {item.stateIndex} — {item.label}</div>
                      <div style={{ color: item.status === 'generated' ? '#86efac' : item.status === 'blocked-missing-fal-key' ? '#fca5a5' : item.status === 'ready-for-provider-implementation' ? '#fcd34d' : '#7dd3fc', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
                        Loop {item.variant.toUpperCase()} • {item.status.replace(/-/g, ' ')}
                      </div>
                    </div>
                    <div style={{ color: '#b4bfd3', marginTop: 8, lineHeight: 1.5 }}>{item.notes}</div>
                    <div style={{ color: '#8ea3c7', marginTop: 8, fontSize: 13, fontFamily: 'Consolas, monospace', wordBreak: 'break-word' }}>Still reference → {item.stillReference ?? item.stillSource}</div>
                    <div style={{ color: '#8ea3c7', marginTop: 6, fontSize: 13, fontFamily: 'Consolas, monospace', wordBreak: 'break-word' }}>Render dir → {item.renderDir}</div>
                    <div style={{ color: '#7dd3fc', marginTop: 6, fontSize: 13, fontFamily: 'Consolas, monospace', wordBreak: 'break-word' }}>Target → {item.target}</div>
                  </div>
                ))}
              </div>
              {assetProduction.loopGenerationResults.length > assetProduction.loopGenerationResultsPreview.length ? (
                <div style={{ color: '#8ea3c7', marginTop: 10, fontSize: 13 }}>
                  +{assetProduction.loopGenerationResults.length - assetProduction.loopGenerationResultsPreview.length} more execution entries in <span style={{ fontFamily: 'Consolas, monospace' }}>data/generated/canonical-loop-generation-results.json</span>
                </div>
              ) : null}
            </div>

            {assetProduction.artifactEntries.length ? (
              <div style={{ borderRadius: 12, padding: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid #2b3655', marginBottom: 16 }}>
                <div style={{ color: '#8ea3c7', textTransform: 'uppercase', letterSpacing: 1, fontSize: 12, marginBottom: 8 }}>Generated production artifacts</div>
                <div style={{ color: '#b4bfd3', lineHeight: 1.6, marginBottom: 12 }}>
                  Open the current asset-production handoff files directly from the app instead of hunting through <span style={{ fontFamily: 'Consolas, monospace' }}>data/generated/</span>. These links expose the latest queue/handoff exports with filename, size, and last-updated context.
                </div>
                <div style={{ marginBottom: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <a href={getAssetProductionStatusHref()} target="_blank" rel="noreferrer" style={{ color: '#7dd3fc', textDecoration: 'none', border: '1px solid #2b3655', borderRadius: 999, padding: '8px 12px', display: 'inline-flex' }}>
                    Open asset production summary JSON
                  </a>
                  <a href={getReviewStatusHref()} target="_blank" rel="noreferrer" style={{ color: '#7dd3fc', textDecoration: 'none', border: '1px solid #2b3655', borderRadius: 999, padding: '8px 12px', display: 'inline-flex' }}>
                    Open review queue summary JSON
                  </a>
                </div>
                <div style={{ display: 'grid', gap: 10 }}>
                  {assetProduction.artifactEntries.map((artifact) => (
                    <div key={artifact.fileName} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center', border: '1px solid #2b3655', borderRadius: 12, padding: '10px 12px' }}>
                      <div style={{ color: '#b4bfd3', lineHeight: 1.5 }}>
                        <div style={{ color: '#e5ecf7', fontWeight: 700 }}>{artifact.label}</div>
                        <div>{artifact.sizeHuman} • updated {formatRunTimestamp(artifact.updatedAt)}</div>
                        <div style={{ color: getFreshnessColor(artifact.freshness.verdict), fontSize: 12 }}>
                          {artifact.freshness.verdict} • age {artifact.freshness.age ?? 'unknown'}{artifact.freshness.staleThresholdHours ? ` • threshold ${artifact.freshness.staleThresholdHours}h` : ''}
                        </div>
                        <div style={{ color: '#8ea3c7', fontSize: 12, fontFamily: 'Consolas, monospace', wordBreak: 'break-word' }}>{artifact.relativePath}</div>
                      </div>
                      <a href={getAssetProductionArtifactHref(artifact.fileName)} target="_blank" rel="noreferrer" style={{ color: '#7dd3fc', textDecoration: 'none', border: '1px solid #2b3655', borderRadius: 999, padding: '8px 12px' }}>Open</a>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div style={{ borderRadius: 12, padding: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid #2b3655', marginBottom: 16 }}>
              <div style={{ color: '#8ea3c7', textTransform: 'uppercase', letterSpacing: 1, fontSize: 12, marginBottom: 8 }}>Production next actions</div>
              <div style={{ color: '#b4bfd3', lineHeight: 1.6, marginBottom: assetProduction.nextActionsPreview.length ? 12 : 0 }}>
                {assetProduction.nextActions.length
                  ? 'This is the single merged handoff exported from the asset pipeline: frontier still work first, then every currently unblocked loop render in production order.'
                  : 'No production actions are exported yet — run asset prep after the first approvals land.'}
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                {assetProduction.nextActionsPreview.map((item) => (
                  <div key={`${item.type}-${item.stateId}-${item.target}`} style={{ borderRadius: 12, padding: 12, background: 'rgba(255,255,255,0.03)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ fontWeight: 700 }}>{item.title}</div>
                      <div style={{ color: item.type === 'generate-still' ? '#fcd34d' : '#7dd3fc', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
                        P{item.priority} • {item.type.replace('generate-', '')}
                      </div>
                    </div>
                    <div style={{ color: '#b4bfd3', marginTop: 8, lineHeight: 1.5 }}>{item.notes}</div>
                    {item.referenceStateId ? (
                      <div style={{ color: '#8ea3c7', marginTop: 8, fontSize: 13, fontFamily: 'Consolas, monospace', wordBreak: 'break-word' }}>Reference state → {item.referenceStateId}</div>
                    ) : null}
                    <div style={{ color: '#8ea3c7', marginTop: 6, fontSize: 13, fontFamily: 'Consolas, monospace', wordBreak: 'break-word' }}>Source → {item.source}</div>
                    <div style={{ color: '#7dd3fc', marginTop: 6, fontSize: 13, fontFamily: 'Consolas, monospace', wordBreak: 'break-word' }}>Target → {item.target}</div>
                  </div>
                ))}
              </div>
              {assetProduction.nextActions.length > assetProduction.nextActionsPreview.length ? (
                <div style={{ color: '#8ea3c7', marginTop: 10, fontSize: 13 }}>
                  +{assetProduction.nextActions.length - assetProduction.nextActionsPreview.length} more actions in <span style={{ fontFamily: 'Consolas, monospace' }}>data/generated/canonical-production-next-actions.json</span>
                </div>
              ) : null}
            </div>

            <div style={{ borderRadius: 12, padding: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid #2b3655', marginBottom: 16 }}>
              <div style={{ color: '#8ea3c7', textTransform: 'uppercase', letterSpacing: 1, fontSize: 12, marginBottom: 8 }}>Loop generation queue</div>
              <div style={{ color: '#b4bfd3', lineHeight: 1.6, marginBottom: assetProduction.loopQueuePreview.length ? 12 : 0 }}>
                {assetProduction.loopQueue.length
                  ? `These are the next approved loop targets pulled directly from the generated queue. Finish the contiguous run first, then expand outward once states ${assetProduction.frontierStates.map((state) => state.index).join(' and ')} are locked.`
                  : 'No loop targets are ready yet — approve a still first.'}
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                {assetProduction.loopQueuePreview.map((item) => (
                  <div key={`${item.stateId}-${item.variant}`} style={{ borderRadius: 12, padding: 12, background: 'rgba(255,255,255,0.03)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ fontWeight: 700 }}>State {item.stateIndex} — {item.label}</div>
                      <div style={{ color: '#7dd3fc', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Loop {item.variant}</div>
                    </div>
                    <div style={{ color: '#b4bfd3', marginTop: 8, lineHeight: 1.5 }}>{item.notes}</div>
                    <div style={{ color: '#8ea3c7', marginTop: 8, fontSize: 13, fontFamily: 'Consolas, monospace', wordBreak: 'break-word' }}>Still source → {item.stillSource}</div>
                    <div style={{ color: '#7dd3fc', marginTop: 6, fontSize: 13, fontFamily: 'Consolas, monospace', wordBreak: 'break-word' }}>Render target → {item.loopTarget}</div>
                  </div>
                ))}
              </div>
              {assetProduction.loopQueue.length > assetProduction.loopQueuePreview.length ? (
                <div style={{ color: '#8ea3c7', marginTop: 10, fontSize: 13 }}>
                  +{assetProduction.loopQueue.length - assetProduction.loopQueuePreview.length} more queued loop targets in <span style={{ fontFamily: 'Consolas, monospace' }}>data/generated/canonical-loop-generation-queue.json</span>
                </div>
              ) : null}
            </div>

            <div style={{ borderRadius: 12, padding: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid #2b3655', marginBottom: 16 }}>
              <div style={{ color: '#8ea3c7', textTransform: 'uppercase', letterSpacing: 1, fontSize: 12, marginBottom: 8 }}>Staged render handoff</div>
              <div style={{ color: '#b4bfd3', lineHeight: 1.6, marginBottom: assetProduction.stagedRenderHandoffPreview.length ? 12 : 0 }}>
                {assetProduction.stagedRenderHandoff.length
                  ? 'This is the concrete operator handoff: the exact manifest file, prompt file, and staged reference copy for each currently actionable still or loop render.'
                  : 'No staged render handoff exists yet — run asset prep after approvals land.'}
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                {assetProduction.stagedRenderHandoffPreview.map((item) => (
                  <div key={`${item.type}-${item.stateId}-${item.variant ?? 'still'}`} style={{ borderRadius: 12, padding: 12, background: 'rgba(255,255,255,0.03)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ fontWeight: 700 }}>State {item.stateIndex} — {item.label}</div>
                      <div style={{ color: item.type === 'still' ? '#fcd34d' : '#7dd3fc', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
                        P{item.priority} • {item.type === 'still' ? 'still handoff' : `loop ${item.variant}`}
                      </div>
                    </div>
                    <div style={{ color: '#b4bfd3', marginTop: 8, lineHeight: 1.5 }}>{item.notes}</div>
                    <div style={{ color: '#8ea3c7', marginTop: 8, fontSize: 13, fontFamily: 'Consolas, monospace', wordBreak: 'break-word' }}>Manifest → {item.renderManifestPath}</div>
                    <div style={{ color: '#8ea3c7', marginTop: 6, fontSize: 13, fontFamily: 'Consolas, monospace', wordBreak: 'break-word' }}>Prompt → {item.renderPromptPath}</div>
                    {item.referenceCopy ? <div style={{ color: '#8ea3c7', marginTop: 6, fontSize: 13, fontFamily: 'Consolas, monospace', wordBreak: 'break-word' }}>Reference copy → {item.referenceCopy}</div> : null}
                    <div style={{ color: '#7dd3fc', marginTop: 6, fontSize: 13, fontFamily: 'Consolas, monospace', wordBreak: 'break-word' }}>Target → {item.target}</div>
                  </div>
                ))}
              </div>
              {assetProduction.stagedRenderHandoff.length > assetProduction.stagedRenderHandoffPreview.length ? (
                <div style={{ color: '#8ea3c7', marginTop: 10, fontSize: 13 }}>
                  +{assetProduction.stagedRenderHandoff.length - assetProduction.stagedRenderHandoffPreview.length} more staged jobs in <span style={{ fontFamily: 'Consolas, monospace' }}>data/generated/canonical-staged-render-handoff.json</span>
                </div>
              ) : null}
            </div>

            <div style={{ borderRadius: 12, padding: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid #2b3655' }}>
              <div style={{ color: '#8ea3c7', textTransform: 'uppercase', letterSpacing: 1, fontSize: 12, marginBottom: 8 }}>Untouched backlog preview</div>
              <div style={{ color: '#b4bfd3', lineHeight: 1.6 }}>
                {assetProduction.pendingStatesPreview.map((state) => `State ${state.index} ${state.label}`).join(' • ')}
                {assetProduction.pendingStates > assetProduction.pendingStatesPreview.length ? ` • +${assetProduction.pendingStates - assetProduction.pendingStatesPreview.length} more` : ''}
              </div>
            </div>
          </div>
        </div>
      </section>

      <DebugPanel
        snapshot={live.snapshot}
        manifest={live.manifest}
        previousStateIndex={previousTransition?.stateIndex}
      />

      <TimelineScrubber history={live.history} />
    </main>
  );
}

function Stat({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ color: '#8ea3c7', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: 18, fontWeight: 700, fontFamily: mono ? 'Consolas, monospace' : 'inherit', wordBreak: 'break-word' }}>{value}</div>
    </div>
  );
}

function HeroChip({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid #2b3655', borderRadius: 14, padding: 12 }}>
      <div style={{ color: '#8ea3c7', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: 20, fontWeight: 800, wordBreak: 'break-word' }}>{value}</div>
    </div>
  );
}

function TimelineMetric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, padding: '10px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid #2b3655' }}>
      <div style={{ color: '#8ea3c7', fontSize: 13 }}>{label}</div>
      <div style={{ fontWeight: 700, textAlign: 'right' }}>{value}</div>
    </div>
  );
}

function InlineBadge({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid #2b3655', borderRadius: 999, padding: '8px 12px', display: 'inline-flex', gap: 8, alignItems: 'center', maxWidth: '100%' }}>
      <span style={{ color: '#8ea3c7', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</span>
      <span style={{ fontWeight: 700, fontFamily: mono ? 'Consolas, monospace' : 'inherit', wordBreak: 'break-word' }}>{value}</span>
    </div>
  );
}

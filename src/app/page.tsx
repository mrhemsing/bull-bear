import { getLiveMarketBeastState } from '@/lib/live-state';
import { DebugPanel } from './debug-panel';
import { HeroMedia } from './hero-media';
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

export default async function HomePage() {
  const live = await getLiveMarketBeastState();
  const previousTransition = live.history[1] ?? null;

  return (
    <main style={{ padding: 32, maxWidth: 1240, margin: '0 auto' }}>
      <header style={{ marginBottom: 32 }}>
        <p style={{ textTransform: 'uppercase', letterSpacing: 2, color: '#8ea3c7', marginBottom: 8 }}>Bull Bear</p>
        <h1 style={{ margin: 0, fontSize: 44 }}>The Bitcoin market beast</h1>
        <p style={{ maxWidth: 800, color: '#b4bfd3', lineHeight: 1.6 }}>
          A cinematic recurring creature driven by a live composite score from Fear &amp; Greed, BTC/USD vs MA7, and BTC/USD vs MA30. The live market maps into 20 canonical beast states, while the historical timeline only records actual state transitions.
        </p>
      </header>

      <section style={{ display: 'grid', gridTemplateColumns: '1.45fr 1fr', gap: 24, marginBottom: 28 }}>
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

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
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

      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 28 }}>
        <div style={{ background: '#121931', borderRadius: 18, padding: 18, border: '1px solid #24304f' }}>
          <div style={{ color: '#8ea3c7', textTransform: 'uppercase', letterSpacing: 1, fontSize: 12, marginBottom: 8 }}>Live signal breakdown</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
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
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid #2b3655' }}>
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

import type { ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { getLiveMarketBeastState } from '@/lib/live-state';

const HeroMedia = dynamic(() => import('../hero-media').then((mod) => mod.HeroMedia), { ssr: false });
const TimelineScrubber = dynamic(() => import('../timeline-scrubber').then((mod) => mod.TimelineScrubber), { ssr: false });

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

export default async function DashboardPage() {
  const live = await getLiveMarketBeastState();
  const previousTransition = live.history[1] ?? null;
  const currentIndex = live.manifest?.index ?? live.snapshot.stateIndex;

  return (
    <main style={{ padding: '28px clamp(18px, 4vw, 40px) 56px', maxWidth: 1320, margin: '0 auto' }}>
      <header style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <p style={{ textTransform: 'uppercase', letterSpacing: 2, color: '#8ea3c7', marginBottom: 8 }}>Bull Bear dashboard</p>
            <h1 style={{ margin: 0, fontSize: 'clamp(2.4rem, 6vw, 56px)', lineHeight: 1.02 }}>Live market creature control room.</h1>
            <p style={{ maxWidth: 760, color: '#b4bfd3', lineHeight: 1.7, marginTop: 14 }}>
              Internal dashboard for the live Bull Bear experience, with the hero, current market read, and timeline in one place.
            </p>
          </div>
          <div style={{ minWidth: 260, background: 'linear-gradient(180deg, rgba(81,137,255,0.18), rgba(81,137,255,0.06))', border: '1px solid #28406f', borderRadius: 22, padding: 18 }}>
            <div style={{ color: '#8ea3c7', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.4, marginBottom: 10 }}>Live state</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>State {currentIndex}</div>
            <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>{live.snapshot.stateLabel}</div>
            <div style={{ color: '#b4bfd3', lineHeight: 1.6 }}>Score {formatSignedNumber(live.snapshot.finalScore)} • {live.creature.direction} • {live.creature.intensity}% intensity</div>
          </div>
        </div>
      </header>

      <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(320px, 0.7fr)', gap: 24, marginBottom: 28, alignItems: 'start' }}>
        <div style={{ background: '#121931', borderRadius: 24, padding: 20, border: '1px solid #24304f', boxShadow: '0 24px 60px rgba(0,0,0,0.28)' }}>
          <HeroMedia
            activeLoop={live.activeLoop}
            activeStill={live.activeStill}
            stateLabel={live.snapshot.stateLabel}
            score={formatSignedNumber(live.snapshot.finalScore)}
            loops={live.activeLoops}
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginTop: 16 }}>
            <MetricCard label="State" value={`${currentIndex} · ${live.snapshot.stateLabel}`} />
            <MetricCard label="BTC/USD" value={formatUsd(live.snapshot.currentPrice)} />
            <MetricCard label="Fear & Greed" value={String(live.snapshot.fearAndGreed)} />
            <MetricCard label="Composite" value={formatSignedNumber(live.snapshot.finalScore)} />
          </div>
        </div>

        <div style={{ display: 'grid', gap: 16 }}>
          <Panel title="Live reading" subtitle="What the market is saying right now.">
            <DetailRow label="Timestamp" value={new Date(live.snapshot.timestamp).toLocaleString()} />
            <DetailRow label="Direction" value={live.creature.direction} />
            <DetailRow label="Intensity" value={`${live.creature.intensity}%`} />
            <DetailRow label="Active loop" value={live.activeLoop ?? 'Pending'} mono />
            <DetailRow label="Resolved still" value={live.activeStill} mono />
          </Panel>

          <Panel title="Signal breakdown" subtitle="The three inputs behind the current state.">
            <SignalBar label="Sentiment" value={live.snapshot.sentimentScore} />
            <SignalBar label="Trend 7" value={live.snapshot.trend7Score} />
            <SignalBar label="Trend 30" value={live.snapshot.trend30Score} />
          </Panel>

          <Panel title="Transition memory" subtitle="How this compares with the last recorded state.">
            <DetailRow label="Latest saved transition" value={live.latestTransition ? new Date(live.latestTransition.timestamp).toLocaleString() : 'None yet'} />
            <DetailRow label="Transition delta" value={formatRelativeStateChange(live.latestTransition?.stateIndex, previousTransition?.stateIndex)} />
            <DetailRow label="Saved transition count" value={String(live.history.length)} />
          </Panel>
        </div>
      </section>

      <section style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <div>
            <div style={{ color: '#8ea3c7', textTransform: 'uppercase', letterSpacing: 1.4, fontSize: 12, marginBottom: 6 }}>Timeline</div>
            <h2 style={{ margin: 0 }}>State transition history</h2>
          </div>
          <div style={{ color: '#b4bfd3', maxWidth: 520, lineHeight: 1.5 }}>
            Scrub the saved state changes to see how Bull Bear has moved through the market instead of staring at internal ops dashboards.
          </div>
        </div>
        <TimelineScrubber history={live.history} />
      </section>
    </main>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <section style={{ background: '#121931', borderRadius: 20, padding: 18, border: '1px solid #24304f' }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>{title}</div>
        <div style={{ color: '#8ea3c7', lineHeight: 1.5 }}>{subtitle}</div>
      </div>
      <div style={{ display: 'grid', gap: 12 }}>{children}</div>
    </section>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ borderRadius: 16, padding: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid #2b3655' }}>
      <div style={{ color: '#8ea3c7', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 22, fontWeight: 800, wordBreak: 'break-word' }}>{value}</div>
    </div>
  );
}

function DetailRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap', padding: '10px 12px', borderRadius: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid #2b3655' }}>
      <div style={{ color: '#8ea3c7', fontSize: 13 }}>{label}</div>
      <div style={{ fontWeight: 700, textAlign: 'right', fontFamily: mono ? 'Consolas, monospace' : 'inherit', wordBreak: 'break-word' }}>{value}</div>
    </div>
  );
}

function SignalBar({ label, value }: { label: string; value: number }) {
  const positive = value >= 0;
  return (
    <div style={{ padding: 12, borderRadius: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid #2b3655' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
        <div style={{ fontWeight: 700 }}>{label}</div>
        <div style={{ color: positive ? '#86efac' : '#fca5a5', fontWeight: 700 }}>{formatSignedNumber(value)}</div>
      </div>
      <div style={{ height: 10, borderRadius: 999, background: '#0c1327', overflow: 'hidden', border: '1px solid #26304b' }}>
        <div style={{ height: '100%', width: `${Math.min(100, Math.max(10, Math.abs(value)))}%`, background: positive ? 'linear-gradient(90deg, #2bd67b, #7fffb2)' : 'linear-gradient(90deg, #f36d6d, #ffb0b0)' }} />
      </div>
    </div>
  );
}

import { getCompositeMarketSnapshot } from '@/lib/btc';
import { getFrames, getStateManifestEntry } from '@/lib/frames';
import { compositeSnapshotToCreatureState } from '@/lib/signal';

function formatSignedNumber(value?: number, digits = 2) {
  if (value === undefined || value === null || Number.isNaN(value)) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(digits)}`;
}

function formatUsd(value?: number) {
  if (value === undefined || value === null || Number.isNaN(value)) return '—';
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default async function HomePage() {
  const live = await getCompositeMarketSnapshot();
  const liveState = compositeSnapshotToCreatureState(live);
  const activeState = getStateManifestEntry(live.stateIndex);
  const frames = getFrames();

  return (
    <main style={{ padding: 32, maxWidth: 1240, margin: '0 auto' }}>
      <header style={{ marginBottom: 32 }}>
        <p style={{ textTransform: 'uppercase', letterSpacing: 2, color: '#8ea3c7', marginBottom: 8 }}>Bull Bear</p>
        <h1 style={{ margin: 0, fontSize: 44 }}>The Bitcoin market beast</h1>
        <p style={{ maxWidth: 800, color: '#b4bfd3', lineHeight: 1.6 }}>
          A cinematic recurring creature driven by a live composite score from Fear &amp; Greed, BTC/USD vs MA7, and BTC/USD vs MA30. The live market maps into 20 canonical beast states, each backed by a still and loop-ready animation slot.
        </p>
      </header>

      <section style={{ display: 'grid', gridTemplateColumns: '1.45fr 1fr', gap: 24, marginBottom: 40 }}>
        <div style={{ background: '#121931', borderRadius: 20, padding: 20, border: '1px solid #24304f' }}>
          <div style={{ aspectRatio: '16 / 9', borderRadius: 16, background: 'linear-gradient(135deg, #243455, #101727 65%)', padding: 22, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ color: '#8ea3c7', textTransform: 'uppercase', letterSpacing: 1.5, fontSize: 12, marginBottom: 10 }}>
                Live canonical state
              </div>
              <div style={{ fontSize: 34, fontWeight: 800, marginBottom: 8 }}>{live.stateLabel}</div>
              <div style={{ color: '#c5d0e7', maxWidth: 620, lineHeight: 1.5 }}>
                State {activeState?.index ?? live.stateIndex} mapped from a live composite market score of {formatSignedNumber(live.finalScore)}. This resolves to the canonical still plus one of three loop variants for the active market regime.
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
              <HeroChip label="Score" value={formatSignedNumber(live.finalScore)} />
              <HeroChip label="F&G" value={String(live.fearAndGreed)} />
              <HeroChip label="MA7" value={formatUsd(live.ma7)} />
              <HeroChip label="MA30" value={formatUsd(live.ma30)} />
            </div>
          </div>
        </div>

        <div style={{ background: '#121931', borderRadius: 20, padding: 24, border: '1px solid #24304f' }}>
          <h2 style={{ marginTop: 0 }}>Live reading</h2>
          <Stat label="Timestamp" value={new Date(live.timestamp).toLocaleString()} />
          <Stat label="BTC/USD price" value={formatUsd(live.currentPrice)} />
          <Stat label="State label" value={live.stateLabel} />
          <Stat label="State index" value={String(live.stateIndex)} />
          <Stat label="Direction" value={liveState.direction} />
          <Stat label="Intensity" value={`${liveState.intensity}%`} />
          <Stat label="Resolved still" value={activeState?.still ?? 'Pending'} mono />
          <Stat label="Loop variants" value={activeState?.loops.join(', ') ?? 'Pending'} mono />
        </div>
      </section>

      <section style={{ marginBottom: 18 }}>
        <div style={{ background: '#121931', borderRadius: 18, padding: 18, border: '1px solid #24304f' }}>
          <div style={{ color: '#8ea3c7', textTransform: 'uppercase', letterSpacing: 1, fontSize: 12, marginBottom: 8 }}>Live signal breakdown</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
            <HeroChip label="Sentiment score" value={formatSignedNumber(live.sentimentScore)} />
            <HeroChip label="Trend 7 score" value={formatSignedNumber(live.trend7Score)} />
            <HeroChip label="Trend 30 score" value={formatSignedNumber(live.trend30Score)} />
            <HeroChip label="Source" value="BTC/USD" />
          </div>
        </div>
      </section>

      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>Historical archive</h2>
          <span style={{ color: '#8ea3c7' }}>{frames.length} saved records</span>
        </div>
        <div style={{ display: 'grid', gap: 14 }}>
          {frames.map((frame) => {
            const state = getStateManifestEntry(frame.stateIndex);
            return (
              <article key={frame.id} style={{ display: 'grid', gridTemplateColumns: '200px 1fr auto', gap: 16, background: '#121931', borderRadius: 16, padding: 16, border: '1px solid #24304f' }}>
                <div style={{ aspectRatio: '16 / 9', borderRadius: 12, background: 'linear-gradient(135deg, #45315f, #131c35)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 14, color: '#c6d1e8' }}>
                  <div style={{ fontSize: 12, color: '#8ea3c7', textTransform: 'uppercase', letterSpacing: 1 }}>Historical state {frame.stateIndex ?? '—'}</div>
                  <div style={{ fontWeight: 700 }}>{frame.stateLabel ?? state?.label ?? frame.stage}</div>
                  <div style={{ fontSize: 12, color: '#9cb0d5' }}>{state?.still ?? frame.imageUrl}</div>
                </div>
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>{new Date(frame.timestamp).toLocaleString()}</div>
                  <div style={{ color: '#b4bfd3', marginBottom: 6 }}>
                    BTC/USD {formatUsd(frame.currentPrice)} · score {formatSignedNumber(frame.finalScore)} · F&amp;G {frame.fearAndGreed ?? '—'}
                  </div>
                  <div style={{ color: '#b4bfd3', marginBottom: 6 }}>
                    MA7 {formatUsd(frame.ma7)} · MA30 {formatUsd(frame.ma30)} · {frame.direction}
                  </div>
                  <div style={{ color: '#8ea3c7', fontSize: 13 }}>{frame.notes ?? frame.prompt}</div>
                </div>
                <div style={{ alignSelf: 'center', color: '#f6d06b', fontWeight: 700, textAlign: 'right' }}>
                  <div>{frame.intensity}%</div>
                  <div style={{ color: '#8ea3c7', fontSize: 12, marginTop: 4 }}>{frame.provider}</div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
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

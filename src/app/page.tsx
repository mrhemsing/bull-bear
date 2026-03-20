import { getFrames, getLatestFrame, getStateManifestEntry } from '@/lib/frames';

function formatSignedNumber(value?: number, digits = 2) {
  if (value === undefined || value === null || Number.isNaN(value)) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(digits)}`;
}

function formatUsd(value?: number) {
  if (value === undefined || value === null || Number.isNaN(value)) return '—';
  return `$${value.toLocaleString()}`;
}

export default function HomePage() {
  const latest = getLatestFrame();
  const frames = getFrames();
  const activeState = getStateManifestEntry(latest?.stateIndex);

  return (
    <main style={{ padding: 32, maxWidth: 1240, margin: '0 auto' }}>
      <header style={{ marginBottom: 32 }}>
        <p style={{ textTransform: 'uppercase', letterSpacing: 2, color: '#8ea3c7', marginBottom: 8 }}>Bull Bear</p>
        <h1 style={{ margin: 0, fontSize: 44 }}>The Bitcoin market beast</h1>
        <p style={{ maxWidth: 800, color: '#b4bfd3', lineHeight: 1.6 }}>
          A cinematic recurring creature driven by a live composite score from Fear &amp; Greed, BTC vs MA7, and BTC vs MA30. The live market maps into 20 canonical beast states, each backed by a still and loop-ready animation slot.
        </p>
      </header>

      {latest ? (
        <section style={{ display: 'grid', gridTemplateColumns: '1.45fr 1fr', gap: 24, marginBottom: 40 }}>
          <div style={{ background: '#121931', borderRadius: 20, padding: 20, border: '1px solid #24304f' }}>
            <div style={{ aspectRatio: '16 / 9', borderRadius: 16, background: 'linear-gradient(135deg, #243455, #101727 65%)', padding: 22, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ color: '#8ea3c7', textTransform: 'uppercase', letterSpacing: 1.5, fontSize: 12, marginBottom: 10 }}>
                  Active canonical state
                </div>
                <div style={{ fontSize: 34, fontWeight: 800, marginBottom: 8 }}>{latest.stateLabel ?? activeState?.label ?? latest.stage}</div>
                <div style={{ color: '#c5d0e7', maxWidth: 620, lineHeight: 1.5 }}>
                  State {activeState?.index ?? latest.stateIndex ?? '—'} mapped from a live composite market score of {formatSignedNumber(latest.finalScore)}. This slot will resolve to the state still plus one of three animation variants.
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
                <HeroChip label="Score" value={formatSignedNumber(latest.finalScore)} />
                <HeroChip label="F&G" value={latest.fearAndGreed !== undefined ? String(latest.fearAndGreed) : '—'} />
                <HeroChip label="MA7" value={formatUsd(latest.ma7)} />
                <HeroChip label="MA30" value={formatUsd(latest.ma30)} />
              </div>
            </div>
          </div>

          <div style={{ background: '#121931', borderRadius: 20, padding: 24, border: '1px solid #24304f' }}>
            <h2 style={{ marginTop: 0 }}>Live reading</h2>
            <Stat label="Timestamp" value={new Date(latest.timestamp).toLocaleString()} />
            <Stat label="BTC price" value={formatUsd(latest.currentPrice)} />
            <Stat label="State label" value={latest.stateLabel ?? '—'} />
            <Stat label="State index" value={latest.stateIndex ? String(latest.stateIndex) : '—'} />
            <Stat label="Direction" value={latest.direction} />
            <Stat label="Intensity" value={`${latest.intensity}%`} />
            <Stat label="Resolved still" value={activeState?.still ?? latest.imageUrl} mono />
            <Stat label="Loop variants" value={activeState?.loops.join(', ') ?? 'Pending'} mono />
          </div>
        </section>
      ) : null}

      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>Timeline archive</h2>
          <span style={{ color: '#8ea3c7' }}>{frames.length} records</span>
        </div>
        <div style={{ display: 'grid', gap: 14 }}>
          {frames.map((frame) => {
            const state = getStateManifestEntry(frame.stateIndex);
            return (
              <article key={frame.id} style={{ display: 'grid', gridTemplateColumns: '200px 1fr auto', gap: 16, background: '#121931', borderRadius: 16, padding: 16, border: '1px solid #24304f' }}>
                <div style={{ aspectRatio: '16 / 9', borderRadius: 12, background: 'linear-gradient(135deg, #45315f, #131c35)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 14, color: '#c6d1e8' }}>
                  <div style={{ fontSize: 12, color: '#8ea3c7', textTransform: 'uppercase', letterSpacing: 1 }}>State {frame.stateIndex ?? '—'}</div>
                  <div style={{ fontWeight: 700 }}>{frame.stateLabel ?? state?.label ?? frame.stage}</div>
                  <div style={{ fontSize: 12, color: '#9cb0d5' }}>{state?.still ?? frame.imageUrl}</div>
                </div>
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>{new Date(frame.timestamp).toLocaleString()}</div>
                  <div style={{ color: '#b4bfd3', marginBottom: 6 }}>
                    BTC {formatUsd(frame.currentPrice)} · score {formatSignedNumber(frame.finalScore)} · F&amp;G {frame.fearAndGreed ?? '—'}
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
      <div style={{ marginTop: 4, fontSize: 20, fontWeight: 800 }}>{value}</div>
    </div>
  );
}

import { getFrames, getLatestFrame } from '@/lib/frames';

function formatPercent(value: number) {
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
}

export default function HomePage() {
  const latest = getLatestFrame();
  const frames = getFrames();

  return (
    <main style={{ padding: 32, maxWidth: 1200, margin: '0 auto' }}>
      <header style={{ marginBottom: 32 }}>
        <p style={{ textTransform: 'uppercase', letterSpacing: 2, color: '#8ea3c7', marginBottom: 8 }}>Bull Bear</p>
        <h1 style={{ margin: 0, fontSize: 44 }}>The BTC market beast</h1>
        <p style={{ maxWidth: 760, color: '#b4bfd3', lineHeight: 1.6 }}>
          A cinematic creature that shifts toward bull or bear based on Bitcoin&apos;s 1-hour move. Every frame is archived so the beast can be scrubbed backward through market history.
        </p>
      </header>

      {latest ? (
        <section style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 24, marginBottom: 40 }}>
          <div style={{ background: '#121931', borderRadius: 20, padding: 20, border: '1px solid #24304f' }}>
            <div style={{ aspectRatio: '16 / 9', borderRadius: 16, background: 'linear-gradient(135deg, #33204e, #0d1427)', display: 'grid', placeItems: 'center', color: '#cad5ee', fontSize: 18 }}>
              Latest frame placeholder<br />{latest.stage}
            </div>
          </div>

          <div style={{ background: '#121931', borderRadius: 20, padding: 24, border: '1px solid #24304f' }}>
            <h2 style={{ marginTop: 0 }}>Latest reading</h2>
            <Stat label="Timestamp" value={new Date(latest.timestamp).toLocaleString()} />
            <Stat label="BTC price" value={`$${latest.currentPrice.toLocaleString()}`} />
            <Stat label="1h change" value={formatPercent(latest.percentChange1h)} />
            <Stat label="Stage" value={latest.stage} />
            <Stat label="Direction" value={latest.direction} />
            <Stat label="Intensity" value={`${latest.intensity}%`} />
          </div>
        </section>
      ) : null}

      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>Timeline archive</h2>
          <span style={{ color: '#8ea3c7' }}>{frames.length} frames</span>
        </div>
        <div style={{ display: 'grid', gap: 14 }}>
          {frames.map((frame) => (
            <article key={frame.id} style={{ display: 'grid', gridTemplateColumns: '180px 1fr auto', gap: 16, background: '#121931', borderRadius: 16, padding: 16, border: '1px solid #24304f' }}>
              <div style={{ aspectRatio: '16 / 9', borderRadius: 12, background: 'linear-gradient(135deg, #45315f, #131c35)', display: 'grid', placeItems: 'center', color: '#c6d1e8', fontSize: 14 }}>
                {frame.stage}
              </div>
              <div>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>{new Date(frame.timestamp).toLocaleString()}</div>
                <div style={{ color: '#b4bfd3', marginBottom: 6 }}>
                  BTC ${frame.currentPrice.toLocaleString()} · 1h {formatPercent(frame.percentChange1h)} · {frame.direction}
                </div>
                <div style={{ color: '#8ea3c7', fontSize: 14 }}>{frame.prompt}</div>
              </div>
              <div style={{ alignSelf: 'center', color: '#f6d06b', fontWeight: 700 }}>{frame.intensity}%</div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ color: '#8ea3c7', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: 18, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

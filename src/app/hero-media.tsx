export function HeroMedia({
  activeLoop,
  activeStill,
  stateLabel,
  score
}: {
  activeLoop: string | null;
  activeStill: string;
  stateLabel: string;
  score: string;
}) {
  return (
    <div style={{ position: 'relative', aspectRatio: '16 / 9', minHeight: 280, borderRadius: 16, overflow: 'hidden', background: '#0c1327', border: '1px solid #2a3555' }}>
      {activeLoop ? (
        <video
          key={activeLoop}
          src={activeLoop}
          poster={activeStill}
          autoPlay
          muted
          loop
          playsInline
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <img
          src={activeStill}
          alt={`${stateLabel} market beast still`}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      )}

      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, rgba(11,16,32,0.12) 0%, rgba(11,16,32,0.18) 38%, rgba(11,16,32,0.82) 100%)',
          pointerEvents: 'none'
        }}
      />

      <div style={{ position: 'absolute', left: 18, right: 18, bottom: 18, display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'end', flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: '#8ea3c7', textTransform: 'uppercase', letterSpacing: 1.5, fontSize: 12, marginBottom: 8 }}>
            {activeLoop ? 'Animation-first hero' : 'Still fallback hero'}
          </div>
          <div style={{ fontSize: 'clamp(1.5rem, 4vw, 30px)', fontWeight: 800, marginBottom: 6, lineHeight: 1.05 }}>{stateLabel}</div>
          <div style={{ color: '#c5d0e7', lineHeight: 1.4, maxWidth: 540 }}>
            {activeLoop
              ? 'Loop variant is active for the current canonical market state.'
              : 'Canonical loop unavailable, falling back to the resolved still asset.'}
          </div>
        </div>
        <div style={{ minWidth: 110, textAlign: 'right' }}>
          <div style={{ color: '#8ea3c7', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Composite</div>
          <div style={{ fontSize: 28, fontWeight: 800 }}>{score}</div>
        </div>
      </div>
    </div>
  );
}

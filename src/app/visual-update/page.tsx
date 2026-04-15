const canonicalLadderStates = [
  { key: '08', label: 'State 08 · Slightly Bearish', note: 'Imported canonical still in the current runtime slot.' },
  { key: '09', label: 'State 09 · Mildly Bearish', note: 'Imported canonical still in the current runtime slot.' },
  { key: '10', label: 'State 10 · Neutral', note: 'Approved identity anchor from Matt\'s imported state set.' },
  { key: '11', label: 'State 11 · Mildly Bullish', note: 'Imported canonical still in the current runtime slot.' },
  { key: '12', label: 'State 12 · Slightly Bullish', note: 'Imported canonical still in the current runtime slot.' }
];

const renderGroups = [
  {
    title: 'Approved canonical center',
    items: [
      {
        label: 'State 10 · Neutral · approved anchor',
        src: '/states/10.png',
        note: 'Approved anchor now shown from Matt\'s flat imported runtime asset.'
      }
    ]
  },
  {
    title: 'Current canonical ladder progress',
    items: canonicalLadderStates.map((state) => ({
      ...state,
      src: `/states/${state.key}.png`
    }))
  },
  {
    title: 'Original neutral anchor batch',
    items: [
      { label: 'Anchor 01', src: '/visual-source/state-10-anchor-01.png', note: 'First-pass neutral candidate.' },
      { label: 'Anchor 02', src: '/visual-source/state-10-anchor-02.png', note: 'Approved winner.' },
      { label: 'Anchor 03', src: '/visual-source/state-10-anchor-03.png', note: 'First-pass neutral candidate.' },
      { label: 'Anchor 04', src: '/visual-source/state-10-anchor-04.png', note: 'First-pass neutral candidate.' }
    ]
  }
];

export default function VisualUpdatePage() {
  return (
    <main style={{ padding: '24px clamp(16px, 3vw, 32px) 48px', maxWidth: 1440, margin: '0 auto' }}>
      <header style={{ marginBottom: 28 }}>
        <p style={{ textTransform: 'uppercase', letterSpacing: 2, color: '#8ea3c7', marginBottom: 8 }}>Bull Bear</p>
        <h1 style={{ margin: 0, fontSize: 'clamp(2.1rem, 5vw, 46px)', lineHeight: 1.05 }}>Visual update</h1>
        <p style={{ maxWidth: 900, color: '#b4bfd3', lineHeight: 1.6 }}>
          Current renders from the emerging canonical ladder. The center identity is approved, and adjacent states are now being shaped around it.
        </p>
      </header>

      {renderGroups.map((group) => (
        <section key={group.title} style={{ marginBottom: 32 }}>
          <h2 style={{ marginTop: 0, marginBottom: 14 }}>{group.title}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 18 }}>
            {group.items.map((item) => (
              <article key={item.label} style={{ background: '#121931', borderRadius: 18, padding: 14, border: '1px solid #24304f' }}>
                <div style={{ aspectRatio: '16 / 10', overflow: 'hidden', borderRadius: 14, background: '#0c1327', border: '1px solid #2a3555', marginBottom: 12 }}>
                  <img src={item.src} alt={item.label} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                </div>
                <div style={{ fontWeight: 800, marginBottom: 6 }}>{item.label}</div>
                <div style={{ color: '#9eb1d4', fontSize: 14, lineHeight: 1.5 }}>{item.note}</div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}

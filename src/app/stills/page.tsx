import fs from 'node:fs';
import path from 'node:path';

function getStillEntries() {
  const statesDir = path.join(process.cwd(), 'public', 'states');
  if (!fs.existsSync(statesDir)) return [] as Array<{ id: string; index: number; stillSrc: string }>;

  return fs.readdirSync(statesDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^\d{2}\.png$/.test(entry.name))
    .map((entry) => ({
      id: entry.name,
      index: Number.parseInt(entry.name.replace('.png', ''), 10),
      stillSrc: `/states/${entry.name}`
    }))
    .sort((a, b) => a.index - b.index);
}

export default function StillsPage() {
  const stills = getStillEntries();

  return (
    <main style={{ padding: '28px clamp(18px, 4vw, 40px) 56px', maxWidth: 1400, margin: '0 auto' }}>
      <header style={{ marginBottom: 24 }}>
        <p style={{ textTransform: 'uppercase', letterSpacing: 2, color: '#8ea3c7', marginBottom: 8 }}>Bull Bear internal</p>
        <h1 style={{ margin: 0, fontSize: 'clamp(2rem, 4vw, 42px)', lineHeight: 1.05 }}>All stills</h1>
      </header>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 18 }}>
        {stills.map((still) => (
          <article key={still.id} style={{ background: '#121931', borderRadius: 18, padding: 12, border: '1px solid #24304f' }}>
            <img src={still.stillSrc} alt={`State ${still.index} still`} style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', borderRadius: 12, display: 'block' }} />
            <div style={{ marginTop: 10, color: '#dbe4f3', fontWeight: 700 }}>State {String(still.index).padStart(2, '0')}</div>
          </article>
        ))}
      </section>
    </main>
  );
}

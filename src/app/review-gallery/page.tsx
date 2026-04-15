import fs from 'node:fs';
import path from 'node:path';
import { StateGallery } from '../state-gallery';

function getStateGalleryEntries() {
  const statesDir = path.join(process.cwd(), 'public', 'states');
  if (!fs.existsSync(statesDir)) return [] as Array<{ id: string; index: number; stillSrc: string; loops: string[] }>;

  return fs.readdirSync(statesDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^\d{2}\.png$/.test(entry.name))
    .map((entry) => {
      const key = entry.name.replace('.png', '');
      const loops = ['a', 'b', 'c']
        .map((suffix) => `/states/${key}-${suffix}.mp4`)
        .filter((loopPath) => fs.existsSync(path.join(statesDir, path.basename(loopPath))));

      return {
        id: `state-${key}`,
        index: Number.parseInt(key, 10),
        stillSrc: `/states/${entry.name}`,
        loops
      };
    })
    .sort((a, b) => a.index - b.index);
}

export default function ReviewGalleryPage() {
  const states = getStateGalleryEntries();

  return (
    <main style={{ padding: '28px clamp(18px, 4vw, 40px) 56px', maxWidth: 1320, margin: '0 auto' }}>
      <header style={{ marginBottom: 24 }}>
        <p style={{ textTransform: 'uppercase', letterSpacing: 2, color: '#8ea3c7', marginBottom: 8 }}>Bull Bear private review</p>
        <h1 style={{ margin: 0, fontSize: 'clamp(2.2rem, 5vw, 48px)', lineHeight: 1.05 }}>20-state internal gallery</h1>
        <p style={{ maxWidth: 760, color: '#b4bfd3', lineHeight: 1.6, marginTop: 12 }}>
          Internal-only review surface for the canonical state stills and loop variants. This stays off the main app experience.
        </p>
      </header>

      <StateGallery states={states} />
    </main>
  );
}

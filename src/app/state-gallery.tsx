'use client';

import { useEffect } from 'react';

type StateGalleryEntry = {
  id: string;
  index: number;
  stillSrc: string;
  loops: string[];
};

export function StateGallery({ states }: { states: StateGalleryEntry[] }) {
  useEffect(() => {
    const videos = Array.from(document.querySelectorAll<HTMLVideoElement>('[data-state-gallery-video="true"]'));
    for (const video of videos) {
      video.playbackRate = 0.25;
      video.defaultPlaybackRate = 0.25;
    }
  }, [states]);

  return (
    <section style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <div style={{ color: '#8ea3c7', textTransform: 'uppercase', letterSpacing: 1.5, fontSize: 12, marginBottom: 6 }}>All canonical states</div>
          <h2 style={{ margin: 0 }}>20-state review gallery</h2>
        </div>
        <div style={{ color: '#b4bfd3', maxWidth: 520, lineHeight: 1.5 }}>
          Every current state is live on the page now, with the canonical still plus imported loop A, B, and C assets wired directly from <span style={{ fontFamily: 'Consolas, monospace' }}>public/states</span>. Gallery videos are slowed to quarter speed for easier review.
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 18 }}>
        {states.map((state) => (
          <article key={state.id} style={{ background: '#121931', borderRadius: 18, padding: 16, border: '1px solid #24304f' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12 }}>
              <div>
                <div style={{ color: '#8ea3c7', textTransform: 'uppercase', letterSpacing: 1, fontSize: 12 }}>State {String(state.index).padStart(2, '0')}</div>
                <div style={{ fontSize: 20, fontWeight: 800 }}>{state.id}</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid #2b3655', borderRadius: 999, padding: '8px 12px', display: 'inline-flex', gap: 8, alignItems: 'center', maxWidth: '100%' }}>
                <span style={{ color: '#8ea3c7', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Assets</span>
                <span style={{ fontWeight: 700 }}>still + loop-a + loop-b + loop-c</span>
              </div>
            </div>
            <img src={state.stillSrc} alt={`${state.id} still`} style={{ width: '100%', borderRadius: 14, border: '1px solid #2b3655', marginBottom: 12, display: 'block', background: '#0b1020' }} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              {state.loops.map((loopSrc, loopIndex) => (
                <div key={loopSrc}>
                  <div style={{ color: '#8ea3c7', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>{`Loop ${String.fromCharCode(65 + loopIndex)}`}</div>
                  <video data-state-gallery-video="true" src={loopSrc} controls muted loop playsInline preload="metadata" style={{ width: '100%', borderRadius: 14, border: '1px solid #2b3655', background: '#0b1020' }} />
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

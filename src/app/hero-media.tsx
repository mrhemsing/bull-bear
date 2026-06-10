'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

declare global {
  interface Window {
    __heroMediaDebug?: {
      advanceLoop: () => void;
      getState: () => { currentLoop: string | null; currentLoopIndex: number; loops: string[] };
    };
  }
}

export function HeroMedia({
  activeLoop,
  activeStill,
  stateLabel,
  score,
  intensity,
  loops = []
}: {
  activeLoop: string | null;
  activeStill: string;
  stateLabel: string;
  score: string;
  intensity?: string;
  loops?: string[];
}) {
  const stateLabelColor = /bull/i.test(stateLabel) ? '#86efac' : /bear/i.test(stateLabel) ? '#fca5a5' : '#f5f7fb';
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const resolvedLoops = useMemo(() => loops.filter((loop): loop is string => typeof loop === 'string' && loop.length > 0), [loops]);
  const initialLoopIndex = useMemo(() => {
    if (resolvedLoops.length === 0) return -1;
    const matchedIndex = activeLoop ? resolvedLoops.indexOf(activeLoop) : -1;
    return matchedIndex >= 0 ? matchedIndex : 0;
  }, [activeLoop, resolvedLoops]);
  const [currentLoopIndex, setCurrentLoopIndex] = useState(initialLoopIndex);

  useEffect(() => {
    setCurrentLoopIndex(initialLoopIndex);
  }, [initialLoopIndex]);

  const currentLoop = currentLoopIndex >= 0 ? resolvedLoops[currentLoopIndex] ?? null : null;
  const preloadLoops = useMemo(
    () => resolvedLoops.filter((loop) => loop !== currentLoop),
    [currentLoop, resolvedLoops]
  );

  useEffect(() => {
    if (resolvedLoops.length === 0) {
      window.__heroMediaDebug = undefined;
      return;
    }

    window.__heroMediaDebug = {
      advanceLoop: () => {
        setCurrentLoopIndex((currentIndex) => {
          const safeIndex = currentIndex >= 0 ? currentIndex : 0;
          return (safeIndex + 1) % resolvedLoops.length;
        });
      },
      getState: () => ({
        currentLoop,
        currentLoopIndex,
        loops: resolvedLoops
      })
    };

    return () => {
      window.__heroMediaDebug = undefined;
    };
  }, [currentLoop, currentLoopIndex, resolvedLoops]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const advanceLoop = () => {
      if (resolvedLoops.length === 0) return;
      setCurrentLoopIndex((currentIndex) => {
        const safeIndex = currentIndex >= 0 ? currentIndex : 0;
        return (safeIndex + 1) % resolvedLoops.length;
      });
    };

    video.addEventListener('ended', advanceLoop);

    return () => {
      video.removeEventListener('ended', advanceLoop);
    };
  }, [currentLoop, resolvedLoops]);

  return (
    <>
    {currentLoop ? (
      <link rel="preload" as="video" href={currentLoop} type="video/mp4" fetchPriority="high" />
    ) : null}
    {preloadLoops.map((loop) => (
      <link key={loop} rel="prefetch" as="video" href={loop} type="video/mp4" />
    ))}
    <div className="heroMediaRoot" style={{ position: 'relative', aspectRatio: '16 / 9', maxHeight: 520, minHeight: 220, borderRadius: 16, overflow: 'hidden', background: '#0c1327', border: '1px solid #2a3555' }}>
      {currentLoop ? (
        <video
          ref={videoRef}
          key={currentLoop}
          src={currentLoop}
          poster={activeStill}
          autoPlay
          muted
          playsInline
          preload="auto"
          data-testid="hero-media-video"
          data-loop-src={currentLoop}
          data-loop-index={String(currentLoopIndex)}
          data-loop-sequence={resolvedLoops.join('|')}
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

      <div className="heroMediaCaption" style={{ position: 'absolute', left: 18, right: 18, bottom: 18, display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'end' }}>
        <div className="heroMediaCaptionLeft">
          <div style={{ fontSize: 'clamp(1.5rem, 4vw, 30px)', fontWeight: 800, marginBottom: 6, lineHeight: 1.05, color: stateLabelColor }}>{stateLabel}</div>
          {intensity ? <div className="heroMediaIntensity" style={{ marginTop: 4, color: '#c5d0e7', fontSize: 13 }}>
            {intensity.split(' · ').map((part, index) => (
              <span key={`${part}-${index}`} className={index === 1 ? 'heroMediaTimeframe' : undefined}>
                {index > 0 ? ' ' : ''}
                {part}
              </span>
            ))}
          </div> : null}
        </div>
        <div className="heroMediaCaptionRight" style={{ minWidth: 110, textAlign: 'right' }}>
          <div style={{ color: '#8ea3c7', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Composite</div>
          <div style={{ fontSize: 28, fontWeight: 800 }}>{score}</div>
        </div>
      </div>
      {preloadLoops.length > 0 ? (
        <div aria-hidden="true" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', opacity: 0, pointerEvents: 'none' }}>
          {preloadLoops.map((loop) => (
            <video
              key={loop}
              src={loop}
              muted
              playsInline
              preload="auto"
              data-testid="hero-media-preload-video"
              data-loop-src={loop}
              style={{ width: 1, height: 1 }}
            />
          ))}
        </div>
      ) : null}
    </div>
    <style jsx>{`
      @media (min-width: 641px) {
        .heroMediaCaptionRight {
          margin-bottom: -10px;
        }

        .heroMediaIntensity {
          white-space: normal;
        }

        .heroMediaTimeframe {
          display: inline;
        }
      }

      @media (max-width: 640px) {
        .heroMediaRoot {
          border: 0 !important;
          border-radius: 0 !important;
          min-height: 0 !important;
          margin-left: -14px !important;
          margin-right: -14px !important;
          width: calc(100% + 28px) !important;
        }

        .heroMediaDebugWrap {
          display: none !important;
        }

        .heroMediaCaption {
          left: 14px !important;
          right: 14px !important;
          bottom: 14px !important;
          gap: 10px !important;
          align-items: flex-end !important;
        }

        .heroMediaCaptionLeft {
          margin-right: auto !important;
          text-align: left !important;
          align-self: flex-end !important;
          max-width: 58%;
        }

        .heroMediaIntensity {
          max-width: 170px;
          white-space: normal;
        }

        .heroMediaTimeframe {
          display: block;
        }

        .heroMediaCaptionRight {
          margin-left: auto !important;
          text-align: right !important;
          align-self: flex-end !important;
          flex: 0 0 auto;
        }
      }
    `}</style>
    </>
  );
}

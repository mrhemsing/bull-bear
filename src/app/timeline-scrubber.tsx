'use client';

import { useMemo, useState } from 'react';
import { StateChart } from './state-chart';
import type { FrameRecord } from '@/lib/types';

function formatSignedNumber(value?: number, digits = 2) {
  if (value === undefined || value === null || Number.isNaN(value)) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(digits)}`;
}

function formatUsd(value?: number) {
  if (value === undefined || value === null || Number.isNaN(value)) return '—';
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function describeDelta(current: number | undefined, previous: number | undefined) {
  if (!current || !previous) return 'First tracked state';
  const delta = current - previous;
  if (delta === 0) return 'No state change';
  return `${delta > 0 ? '+' : ''}${delta} state steps`;
}

export function TimelineScrubber({
  history,
  selectedIndex,
  onSelectIndex,
  compact = false
}: {
  history: FrameRecord[];
  selectedIndex?: number;
  onSelectIndex?: (index: number) => void;
  compact?: boolean;
}) {
  const [internalSelectedIndex, setInternalSelectedIndex] = useState(0);
  const resolvedIndex = selectedIndex ?? internalSelectedIndex;
  const selected = history[resolvedIndex] ?? null;
  const previous = history[resolvedIndex + 1] ?? null;
  const scrubberStops = useMemo(() => history.map((frame, index) => ({ frame, index })), [history]);

  const updateSelection = (index: number) => {
    setInternalSelectedIndex(index);
    onSelectIndex?.(index);
  };

  if (!selected) {
    return (
      <section style={{ background: '#121931', borderRadius: 18, padding: 18, border: '1px solid #24304f' }}>
        <h2 style={{ marginTop: 0 }}>State transition timeline</h2>
        <p style={{ color: '#b4bfd3', marginBottom: 0 }}>No transition history yet.</p>
      </section>
    );
  }

  return (
    <section>
      {!compact ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 28 }}>State transition timeline</h2>
            <div style={{ color: '#8ea3c7', marginTop: 6 }}>{history.length} saved transitions · drag or click anywhere on the rail to scrub</div>
          </div>
          <div style={{ color: '#f6d06b', fontWeight: 700 }}>Selected: {selected.stateLabel ?? selected.stage}</div>
        </div>
      ) : null}

      {!compact ? (
        <StateChart history={history} selectedIndex={resolvedIndex} onSelect={updateSelection} />
      ) : null}

      <div style={{ background: compact ? 'transparent' : 'linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))', borderRadius: 22, padding: compact ? 0 : 18, border: compact ? 'none' : '1px solid #24304f', marginBottom: compact ? 0 : 16 }}>
        {!compact ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
            <div>
              <div style={{ color: '#8ea3c7', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Interactive scrubber</div>
              <div style={{ fontWeight: 700, fontSize: 20, marginTop: 4 }}>{new Date(selected.timestamp).toLocaleDateString()}</div>
            </div>
            <div style={{ color: '#b4bfd3', maxWidth: 420, lineHeight: 1.5 }}>Move through time to swap the hero state and market snapshot in place. This is the main interaction surface for the public page.</div>
          </div>
        ) : null}

        <div style={{ position: 'relative', padding: compact ? '8px 0 2px' : '16px 4px 6px' }}>
          <div style={{ position: 'absolute', left: 4, right: 4, top: 28, height: 6, borderRadius: 999, background: 'linear-gradient(90deg, rgba(243,109,109,0.65), rgba(246,208,107,0.7), rgba(127,255,178,0.7))' }} />
          <input
            type="range"
            min={0}
            max={Math.max(0, history.length - 1)}
            step={1}
            value={resolvedIndex}
            onChange={(event) => updateSelection(Number(event.target.value))}
            style={{ width: '100%', margin: 0, accentColor: '#f6d06b', position: 'relative', background: 'transparent' }}
            aria-label="Timeline scrubber"
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(72px, 1fr))', gap: 8, marginTop: compact ? 8 : 10, paddingBottom: 2 }}>
            {scrubberStops.map(({ frame, index }) => {
              const active = index === resolvedIndex;
              return (
                <button
                  key={frame.id}
                  type="button"
                  onClick={() => updateSelection(index)}
                  style={{
                    minWidth: 0,
                    padding: '10px 12px',
                    borderRadius: 999,
                    border: active ? '1px solid #f6d06b' : '1px solid #2b3655',
                    background: active ? 'rgba(246,208,107,0.12)' : 'rgba(255,255,255,0.03)',
                    color: '#f5f7fb',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ fontSize: 11, color: active ? '#f6d06b' : '#8ea3c7', marginBottom: 4 }}>S{frame.stateIndex ?? '—'}</div>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{new Date(frame.timestamp).toLocaleDateString()}</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {!compact ? <article style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 0.8fr) minmax(280px, 1.2fr)', gap: 16, background: '#121931', borderRadius: 20, padding: 18, border: '1px solid #24304f' }}>
        <div style={{ borderRadius: 18, background: 'linear-gradient(135deg, rgba(69,49,95,0.9), rgba(19,28,53,0.95))', padding: 18, border: '1px solid #2b3655' }}>
          <div style={{ color: '#8ea3c7', textTransform: 'uppercase', letterSpacing: 1, fontSize: 12, marginBottom: 12 }}>Snapshot focus</div>
          <div style={{ fontWeight: 800, fontSize: 28, lineHeight: 1.05, marginBottom: 10 }}>{selected.stateLabel ?? selected.stage}</div>
          <div style={{ color: '#b4bfd3', lineHeight: 1.6, marginBottom: 14 }}>{selected.notes ?? selected.prompt}</div>
          <div style={{ color: '#f6d06b', fontSize: 14, fontWeight: 700 }}>Recorded asset: {selected.imageUrl}</div>
        </div>

        <div>
          <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 20 }}>{new Date(selected.timestamp).toLocaleString()}</div>
          <div style={{ color: '#b4bfd3', marginBottom: 8 }}>
            BTC/USD {formatUsd(selected.currentPrice)} · score {formatSignedNumber(selected.finalScore)} · F&amp;G {selected.fearAndGreed ?? '—'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
            <MiniMetric label="State delta" value={describeDelta(selected.stateIndex, previous?.stateIndex)} />
            <MiniMetric label="Intensity" value={`${selected.intensity}%`} />
            <MiniMetric label="Direction" value={selected.direction} />
            <MiniMetric label="Provider" value={selected.provider} />
          </div>
        </div>
      </article> : null}
    </section>
  );
}

function MiniMetric({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ padding: '10px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid #2b3655' }}>
      <div style={{ color: '#8ea3c7', fontSize: 12, marginBottom: 4 }}>{label}</div>
      <div style={{ fontWeight: 700, fontFamily: mono ? 'Consolas, monospace' : 'inherit', wordBreak: 'break-word' }}>{value}</div>
    </div>
  );
}

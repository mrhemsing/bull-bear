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

export function TimelineScrubber({ history }: { history: FrameRecord[] }) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const selected = history[selectedIndex] ?? null;
  const previous = history[selectedIndex + 1] ?? null;
  const scrubberStops = useMemo(
    () => history.map((frame, index) => ({ frame, index })),
    [history]
  );

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0 }}>State transition timeline</h2>
          <div style={{ color: '#8ea3c7', marginTop: 6 }}>{history.length} saved transitions · scrub to inspect any transition</div>
        </div>
        <div style={{ color: '#f6d06b', fontWeight: 700 }}>Selected: {selected.stateLabel ?? selected.stage}</div>
      </div>

      <StateChart history={history} selectedIndex={selectedIndex} onSelect={setSelectedIndex} />

      <div style={{ background: '#121931', borderRadius: 18, padding: 18, border: '1px solid #24304f', marginBottom: 16 }}>
        <input
          type="range"
          min={0}
          max={Math.max(0, history.length - 1)}
          step={1}
          value={selectedIndex}
          onChange={(event) => setSelectedIndex(Number(event.target.value))}
          style={{ width: '100%', marginBottom: 18 }}
          aria-label="Timeline scrubber"
        />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
          {scrubberStops.map(({ frame, index }) => (
            <button
              key={frame.id}
              type="button"
              onClick={() => setSelectedIndex(index)}
              style={{
                textAlign: 'left',
                padding: 12,
                borderRadius: 12,
                border: index === selectedIndex ? '1px solid #f6d06b' : '1px solid #2b3655',
                background: index === selectedIndex ? 'rgba(246,208,107,0.12)' : 'rgba(255,255,255,0.03)',
                color: '#f5f7fb',
                cursor: 'pointer'
              }}
            >
              <div style={{ fontSize: 12, color: '#8ea3c7', marginBottom: 6 }}>State {frame.stateIndex ?? '—'}</div>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>{frame.stateLabel ?? frame.stage}</div>
              <div style={{ fontSize: 12, color: '#b4bfd3' }}>{new Date(frame.timestamp).toLocaleDateString()}</div>
            </button>
          ))}
        </div>
      </div>

      <article style={{ display: 'grid', gridTemplateColumns: '220px 1fr auto', gap: 16, background: '#121931', borderRadius: 16, padding: 16, border: '1px solid #24304f' }}>
        <div style={{ aspectRatio: '16 / 9', borderRadius: 12, background: 'linear-gradient(135deg, #45315f, #131c35)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 14, color: '#c6d1e8' }}>
          <div style={{ fontSize: 12, color: '#8ea3c7', textTransform: 'uppercase', letterSpacing: 1 }}>Selected transition</div>
          <div style={{ fontWeight: 700, fontSize: 22 }}>{selected.stateLabel ?? selected.stage}</div>
          <div style={{ fontSize: 12, color: '#9cb0d5', wordBreak: 'break-word' }}>{selected.imageUrl}</div>
        </div>

        <div>
          <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 18 }}>{new Date(selected.timestamp).toLocaleString()}</div>
          <div style={{ color: '#b4bfd3', marginBottom: 6 }}>
            BTC/USD {formatUsd(selected.currentPrice)} · score {formatSignedNumber(selected.finalScore)} · F&amp;G {selected.fearAndGreed ?? '—'}
          </div>
          <div style={{ color: '#b4bfd3', marginBottom: 6 }}>
            MA7 {formatUsd(selected.ma7)} · MA30 {formatUsd(selected.ma30)} · {selected.direction}
          </div>
          <div style={{ color: '#8ea3c7', fontSize: 13, marginBottom: 10 }}>{selected.notes ?? selected.prompt}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
            <MiniMetric label="State delta" value={describeDelta(selected.stateIndex, previous?.stateIndex)} />
            <MiniMetric label="Intensity" value={`${selected.intensity}%`} />
            <MiniMetric label="Provider" value={selected.provider} />
            <MiniMetric label="Recorded asset" value={selected.imageUrl} mono />
          </div>
        </div>

        <div style={{ alignSelf: 'center', color: '#f6d06b', fontWeight: 700, textAlign: 'right' }}>
          <div style={{ fontSize: 28 }}>{selected.stateIndex ?? '—'}</div>
          <div style={{ color: '#8ea3c7', fontSize: 12, marginTop: 4 }}>state index</div>
        </div>
      </article>
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

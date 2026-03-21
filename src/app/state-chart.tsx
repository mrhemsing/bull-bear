'use client';

import type { FrameRecord } from '@/lib/types';

function formatSignedNumber(value?: number, digits = 2) {
  if (value === undefined || value === null || Number.isNaN(value)) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(digits)}`;
}

function getBandColor(stateIndex?: number) {
  if (!stateIndex) return '#6b7280';
  if (stateIndex <= 4) return '#ef4444';
  if (stateIndex <= 9) return '#f59e0b';
  if (stateIndex === 10) return '#94a3b8';
  if (stateIndex <= 15) return '#84cc16';
  return '#22c55e';
}

export function StateChart({
  history,
  selectedIndex,
  onSelect
}: {
  history: FrameRecord[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}) {
  if (!history.length) return null;

  const maxState = 20;
  const minState = 1;

  return (
    <div style={{ background: '#121931', borderRadius: 18, padding: 18, border: '1px solid #24304f', marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <div style={{ color: '#8ea3c7', textTransform: 'uppercase', letterSpacing: 1, fontSize: 12, marginBottom: 6 }}>Chart sync</div>
          <div style={{ fontWeight: 700, fontSize: 20 }}>State-band timeline</div>
        </div>
        <div style={{ color: '#8ea3c7' }}>Higher = more bullish · click any point to sync selection</div>
      </div>

      <div style={{ position: 'relative', height: 220, padding: '12px 0 28px' }}>
        <div style={{ position: 'absolute', inset: '12px 0 28px 0', display: 'grid', gridTemplateRows: 'repeat(5, 1fr)' }}>
          {[20, 15, 10, 5, 1].map((tick) => (
            <div key={tick} style={{ borderTop: '1px solid rgba(142,163,199,0.16)', position: 'relative' }}>
              <span style={{ position: 'absolute', left: 0, top: -10, color: '#8ea3c7', fontSize: 11 }}>S{tick}</span>
            </div>
          ))}
        </div>

        <div style={{ position: 'absolute', inset: '12px 0 28px 0', display: 'flex', alignItems: 'end', gap: 10 }}>
          {history.map((frame, index) => {
            const stateIndex = frame.stateIndex ?? 10;
            const normalized = (stateIndex - minState) / (maxState - minState);
            const height = 32 + normalized * 140;
            const selected = index === selectedIndex;

            return (
              <button
                key={frame.id}
                type="button"
                onClick={() => onSelect(index)}
                title={`${frame.stateLabel ?? frame.stage} · ${formatSignedNumber(frame.finalScore)} · state ${stateIndex}`}
                style={{
                  flex: 1,
                  height: '100%',
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'end',
                  alignItems: 'center',
                  gap: 8
                }}
              >
                <div
                  style={{
                    width: '100%',
                    maxWidth: 54,
                    height,
                    borderRadius: 12,
                    background: getBandColor(stateIndex),
                    opacity: selected ? 1 : 0.78,
                    boxShadow: selected ? '0 0 0 2px #f6d06b' : 'none',
                    transition: 'all 160ms ease'
                  }}
                />
                <div style={{ textAlign: 'center' }}>
                  <div style={{ color: selected ? '#f6d06b' : '#e5e7eb', fontWeight: 700, fontSize: 12 }}>S{stateIndex}</div>
                  <div style={{ color: '#8ea3c7', fontSize: 11 }}>{new Date(frame.timestamp).toLocaleDateString()}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

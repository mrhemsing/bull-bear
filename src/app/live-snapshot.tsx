'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import type { CompositeMarketSnapshot, CreatureState, FrameRecord, StateManifestEntry } from '@/lib/types';
import { HeroMedia } from './hero-media';

const badgeBaseStyle = {
  display: 'inline-block',
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontSize: '11px',
  fontWeight: 600,
  letterSpacing: '2.16px',
  textTransform: 'uppercase' as const,
  textDecoration: 'none',
  paddingTop: '4px',
  paddingBottom: '4px',
  paddingLeft: '6px',
  paddingRight: '5px',
  borderRadius: 0,
  lineHeight: 1,
  backgroundColor: '#ffffff',
  color: '#000000'
};

type SnapshotView = {
  source?: string;
  timestamp: string;
  currentPrice: number;
  ma7: number;
  ma30: number;
  priceChange24h: number;
  priceChange7d: number;
  fearAndGreed: number;
  fearGreedScore: number;
  marketBiasScore: number;
  momentumScore: number;
  derivativesScore: number;
  fundingRate: number;
  basisPct: number;
  openInterestChangePct1h: number;
  takerBuySellRatio: number;
  finalScore: number;
  stateIndex: number;
  stateLabel: string;
  activeStill: string;
  activeLoop: string | null;
  activeLoops: string[];
  direction: string;
  intensity: number;
};

function formatSignedNumber(value?: number, digits = 2) {
  if (value === undefined || value === null || Number.isNaN(value)) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(digits)}`;
}

function formatPlainNumber(value?: number, digits = 2) {
  if (value === undefined || value === null || Number.isNaN(value)) return '—';
  return value.toFixed(digits);
}

function formatWholeSignedNumber(value?: number) {
  if (value === undefined || value === null || Number.isNaN(value)) return '—';
  return `${value > 0 ? '+' : ''}${Math.round(value)}`;
}

function formatUsd(value?: number) {
  if (value === undefined || value === null || Number.isNaN(value) || value <= 0) return '—';
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatPercent(value?: number) {
  if (value === undefined || value === null || Number.isNaN(value)) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function formatMetricTrend(value?: number, mode: 'percent' | 'ratio' = 'percent') {
  if (value === undefined || value === null || Number.isNaN(value)) return { icon: '•', color: '#94a3b8' };
  const weakThreshold = mode === 'ratio' ? 0.015 : 0.05;
  const strongThreshold = mode === 'ratio' ? 0.08 : 1;
  if (Math.abs(value) <= weakThreshold) return { icon: '◆', color: '#94a3b8' };
  if (value > 0) return { icon: '▲', color: value >= strongThreshold ? '#4ade80' : '#86efac' };
  return { icon: '▼', color: value <= -strongThreshold ? '#f87171' : '#fca5a5' };
}

function formatRelativeTime(timestamp: string) {
  const time = Date.parse(timestamp);
  if (Number.isNaN(time)) return 'Updated recently';
  const diffSeconds = Math.max(0, Math.round((Date.now() - time) / 1000));
  if (diffSeconds < 60) return `Updated ${diffSeconds}s ago`;
  const diffMinutes = Math.round(diffSeconds / 60);
  if (diffMinutes < 60) return `Updated ${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  return `Updated ${diffHours}h ago`;
}

function isFallbackSnapshot(view: SnapshotView) {
  return typeof view.source === 'string' && /fallback snapshot/i.test(view.source);
}

function getConfidence(view: SnapshotView) {
  const components = [view.fearGreedScore, view.marketBiasScore, view.momentumScore, view.derivativesScore];
  const directionalAgreement = components.filter((value) => value === 0 || Math.sign(value) === Math.sign(view.finalScore)).length / components.length;
  const scoreStrength = Math.min(1, Math.abs(view.finalScore) / 50);
  const freshnessPenalty = Math.min(0.2, Math.max(0, (Date.now() - Date.parse(view.timestamp) - 75 * 60 * 1000) / (6 * 60 * 60 * 1000)));
  const confidence = Math.round(Math.max(0, Math.min(100, ((directionalAgreement * 0.55) + (scoreStrength * 0.45) - freshnessPenalty) * 100)));
  return confidence;
}

function getConfidenceLabel(confidence: number) {
  if (confidence >= 75) return 'High';
  if (confidence >= 50) return 'Moderate';
  return 'Low';
}

function summarizeWhy(view: SnapshotView) {
  const contributions = [
    { label: 'Fear & Greed', value: view.fearGreedScore },
    { label: 'Coinbase spot regime', value: view.marketBiasScore },
    { label: 'Coinbase momentum', value: view.momentumScore },
    { label: 'Binance positioning', value: view.derivativesScore }
  ].sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

  const strongest = contributions[0];
  const leadingWithTrend = contributions.find((item) => Math.sign(item.value) === Math.sign(view.finalScore) && item.value !== 0) ?? strongest;
  const counter = contributions.find((item) => Math.sign(item.value) !== Math.sign(view.finalScore) && item.value !== 0);

  if (view.finalScore > 0) {
    return `Bullish: ${leadingWithTrend?.label ?? 'The composite'} is leading higher, with Coinbase spot, momentum, and Binance positioning keeping the model positive${counter ? ` despite ${counter.label.toLowerCase()} at ${formatWholeSignedNumber(counter.value)}` : ''}.`;
  }

  if (view.finalScore < 0) {
    return `Bearish: ${leadingWithTrend?.label ?? 'The composite'} is leaning risk-off, with Coinbase spot, momentum, and Binance positioning keeping the model negative${counter ? ` even with ${counter.label.toLowerCase()} at ${formatWholeSignedNumber(counter.value)}` : ''}.`;
  }

  return `Balanced: ${strongest ? `${strongest.label} is only ${formatWholeSignedNumber(strongest.value)}` : 'Inputs are closely matched'}, so the market is still sitting near the midpoint.`;
}

function getTopDrivers(view: SnapshotView) {
  return [
    { label: 'Fear & Greed', value: view.fearGreedScore, reason: view.fearAndGreed <= 25 ? 'Extreme fear is still the dominant top-line input.' : view.fearAndGreed >= 75 ? 'Greed is supportive, but no longer enough on its own.' : 'Fear & Greed is near the middle and not overpowering spot or derivatives.' },
    { label: 'Coinbase spot regime', value: view.marketBiasScore, reason: view.marketBiasScore >= 0 ? 'Coinbase price structure stays above the bearish threshold.' : 'Coinbase price structure is still leaning below trend support.' },
    { label: 'Coinbase momentum', value: view.momentumScore, reason: view.momentumScore >= 0 ? 'Hourly RSI, MACD, and the latest impulse are helping.' : 'Hourly RSI, MACD, and the latest impulse are still fading.' },
    { label: 'Binance positioning', value: view.derivativesScore, reason: view.derivativesScore >= 0 ? `Funding, basis, open interest, and taker flow are aligned long.` : 'Funding, basis, open interest, and taker flow are leaning defensive.' }
  ].sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, 3);
}


export function LiveSnapshot({
  liveSnapshot,
  creature,
  manifest,
  activeStill,
  activeLoop,
  activeLoops,
  history
}: {
  liveSnapshot: CompositeMarketSnapshot;
  creature: CreatureState;
  manifest: StateManifestEntry | null;
  activeStill: string;
  activeLoop: string | null;
  activeLoops: string[];
  history: FrameRecord[];
}) {
  const [selectedIndex] = useState(-1);
  const selectedFrame = selectedIndex >= 0 ? history[selectedIndex] ?? null : null;

  const view: SnapshotView = selectedFrame
    ? {
        timestamp: selectedFrame.timestamp,
        currentPrice: selectedFrame.currentPrice,
        ma7: selectedFrame.ma7 ?? liveSnapshot.ma7,
        ma30: selectedFrame.ma30 ?? liveSnapshot.ma30,
        priceChange24h: liveSnapshot.priceChange24h,
        priceChange7d: liveSnapshot.priceChange7d,
        fearAndGreed: selectedFrame.fearAndGreed ?? liveSnapshot.fearAndGreed,
        fearGreedScore: liveSnapshot.fearGreedScore,
        marketBiasScore: liveSnapshot.marketBiasScore,
        momentumScore: liveSnapshot.momentumScore,
        derivativesScore: liveSnapshot.derivativesScore,
        fundingRate: liveSnapshot.fundingRate,
        basisPct: liveSnapshot.basisPct,
        openInterestChangePct1h: liveSnapshot.openInterestChangePct1h,
        takerBuySellRatio: liveSnapshot.takerBuySellRatio,
        finalScore: selectedFrame.finalScore ?? selectedFrame.signedScore ?? liveSnapshot.finalScore,
        stateIndex: selectedFrame.stateIndex ?? liveSnapshot.stateIndex,
        stateLabel: selectedFrame.stateLabel ?? liveSnapshot.stateLabel,
        activeStill: selectedFrame.imageUrl,
        activeLoop: null,
        activeLoops: [],
        direction: selectedFrame.direction,
        intensity: selectedFrame.intensity
      }
    : {
        source: liveSnapshot.source,
        timestamp: liveSnapshot.timestamp,
        currentPrice: liveSnapshot.currentPrice,
        ma7: liveSnapshot.ma7,
        ma30: liveSnapshot.ma30,
        priceChange24h: liveSnapshot.priceChange24h,
        priceChange7d: liveSnapshot.priceChange7d,
        fearAndGreed: liveSnapshot.fearAndGreed,
        fearGreedScore: liveSnapshot.fearGreedScore,
        marketBiasScore: liveSnapshot.marketBiasScore,
        momentumScore: liveSnapshot.momentumScore,
        derivativesScore: liveSnapshot.derivativesScore,
        fundingRate: liveSnapshot.fundingRate,
        basisPct: liveSnapshot.basisPct,
        openInterestChangePct1h: liveSnapshot.openInterestChangePct1h,
        takerBuySellRatio: liveSnapshot.takerBuySellRatio,
        finalScore: liveSnapshot.finalScore,
        stateIndex: manifest?.index ?? liveSnapshot.stateIndex,
        stateLabel: liveSnapshot.stateLabel,
        activeStill,
        activeLoop,
        activeLoops,
        direction: creature.direction,
        intensity: creature.intensity
      };

  const fallbackMode = isFallbackSnapshot(view);
  const confidence = getConfidence(view);
  const confidenceLabel = getConfidenceLabel(confidence);
  const why = summarizeWhy(view);
  const topDrivers = getTopDrivers(view);

  return (
    <>
    <section className="liveSnapshotLayout" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.45fr) minmax(320px, 0.55fr)', gap: 24, alignItems: 'start' }}>
      <div className="liveSnapshotPrimary" style={{ display: 'grid', gap: 16, minWidth: 0 }}>
        <div className="liveSnapshotTitle" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 4px' }}>
          <img src="/btc-logo.svg" alt="Bitcoin logo" style={{ width: 47, height: 47, flex: '0 0 auto' }} />
          <h1 style={{ margin: 0, fontSize: 'clamp(1.9rem, 4vw, 40px)', lineHeight: 1 }}>Bulls vs. Bears</h1>
        </div>
        <HeroMedia
          activeLoop={view.activeLoop}
          activeStill={view.activeStill}
          stateLabel={view.stateLabel}
          score={formatWholeSignedNumber(view.finalScore)}
          intensity={`Confidence: ${confidenceLabel} (${confidence}) · 1H timeframe`}
          loops={view.activeLoops}
        />
        <div style={{ background: '#121931', borderRadius: 28, padding: 20, border: '1px solid #24304f', boxShadow: '0 24px 60px rgba(0,0,0,0.28)' }}>
          <div style={{ color: '#8ea3c7', textTransform: 'uppercase', letterSpacing: 1.2, fontSize: 11, marginBottom: 8 }}>Current analysis</div>
          <div style={{ color: '#dbe4f3', lineHeight: 1.55 }}>{why}</div>
        </div>
        <div className="desktopBadgeRow" style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', gap: 10, marginTop: 2, marginLeft: 20 }}>
          <div style={{ color: '#8ea3c7', fontSize: 12 }}>© 2026</div>
          <a href="https://b-average.com" target="_blank" rel="noreferrer" style={badgeBaseStyle}>
            B AVERAGE
          </a>
        </div>
      </div>

      <aside className="liveSnapshotSidebar" style={{ display: 'grid', gap: 16, minWidth: 0 }}>
        <section style={{ background: '#121931', borderRadius: 24, padding: 18, border: '1px solid #24304f' }}>
          <div style={{ color: '#8ea3c7', textTransform: 'uppercase', letterSpacing: 1.4, fontSize: 12, marginBottom: 13 }}>
            {formatRelativeTime(view.timestamp)} ({new Date(view.timestamp).toLocaleString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })} UTC)
          </div>
          {fallbackMode ? (
            <div style={{ marginBottom: 14, padding: '10px 12px', borderRadius: 12, background: 'rgba(250, 204, 21, 0.08)', border: '1px solid rgba(250, 204, 21, 0.22)', color: '#f8e08e', fontSize: 13, lineHeight: 1.45 }}>
              Live exchange inputs are temporarily unavailable, so Bull Bear is showing a neutral fallback state instead of misleading market numbers.
            </div>
          ) : null}
          <FearGreedGauge value={view.fearAndGreed} />
          <SectionLabel>Market snapshot</SectionLabel>
          <ValueRow label="BTC price" value={fallbackMode ? 'Unavailable' : formatUsd(view.currentPrice)} trend={fallbackMode ? undefined : formatMetricTrend(view.priceChange24h)} />
          <ValueRow label="24h move" value={fallbackMode ? 'Unavailable' : formatPercent(view.priceChange24h)} trend={fallbackMode ? undefined : formatMetricTrend(view.priceChange24h)} help={`Spot move over the last 24 hours from Coinbase hourly candles.`} />
          <ValueRow label="7d move" value={fallbackMode ? 'Unavailable' : formatPercent(view.priceChange7d)} trend={fallbackMode ? undefined : formatMetricTrend(view.priceChange7d)} help={`Spot move over the last 7 days from Coinbase hourly candles.`} />
          <div style={{ color: '#6f85ab', fontSize: 12, marginTop: 8, marginBottom: 2 }}>Model: Fear & Greed + Coinbase spot regime + Coinbase momentum + Binance positioning</div>
        </section>
        <section style={{ background: '#121931', borderRadius: 24, padding: 18, border: '1px solid #24304f' }}>
          <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 12 }}>Composite breakdown</div>
          <SignalBar label="Fear & Greed" value={view.fearGreedScore} weight="18%" help={`Alternative.me Fear & Greed stays at the top of the stack, but it is now tempered by spot and derivatives context.`} />
          <SignalBar label="Coinbase spot regime" value={view.marketBiasScore} weight="35%" help={`Coinbase spot regime score using BTC versus EMA200 plus 24h and 7d change.`} />
          <SignalBar label="Coinbase momentum" value={view.momentumScore} weight="22%" help={`Coinbase hourly RSI, MACD, and latest 1h impulse.`} />
          <SignalBar label="Binance positioning" value={view.derivativesScore} weight="25%" help={`Binance funding, basis, 1h open-interest change, and taker buy/sell flow.`} />
        </section>
        <section style={{ background: '#121931', borderRadius: 24, padding: 18, border: '1px solid #24304f' }}>
          <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 12 }}>Top drivers</div>
          <div style={{ display: 'grid', gap: 10 }}>
            {topDrivers.map((driver) => (
              <div key={driver.label} style={{ borderRadius: 14, padding: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid #2b3655' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
                  <div style={{ fontWeight: 700 }}>{driver.label}</div>
                  <div style={{ color: driver.value >= 0 ? '#86efac' : '#fca5a5', fontWeight: 700 }}>{formatWholeSignedNumber(driver.value)}</div>
                </div>
                <div style={{ color: '#b4bfd3', lineHeight: 1.45 }}>{driver.reason}</div>
              </div>
            ))}
          </div>
        </section>
        <div className="mobileBadgeRow" style={{ display: 'none', justifyContent: 'flex-start', alignItems: 'center', gap: 10, marginTop: 2, marginLeft: 20 }}>
          <div style={{ color: '#8ea3c7', fontSize: 12 }}>© 2026</div>
          <a href="https://b-average.com" target="_blank" rel="noreferrer" style={badgeBaseStyle}>
            B AVERAGE
          </a>
        </div>
      </aside>
    </section>
    <style jsx>{`
      .liveSnapshotLayout {
        grid-template-columns: minmax(0, 1.45fr) minmax(320px, 0.55fr);
      }

      @media (max-width: 900px) {
        .liveSnapshotLayout {
          grid-template-columns: minmax(0, 1fr) !important;
          grid-template-areas:
            'primary'
            'sidebar';
          gap: 16px !important;
        }

        .liveSnapshotPrimary {
          grid-area: primary;
        }

        .liveSnapshotSidebar {
          grid-area: sidebar;
        }
      }

      @media (max-width: 640px) {
        .liveSnapshotTitle {
          padding: 0 !important;
        }

        .liveSnapshotLayout {
          gap: 14px !important;
        }

        .liveSnapshotPrimary {
          gap: 26px !important;
        }

        .liveSnapshotSidebar {
          gap: 26px !important;
          margin-top: 10px !important;
        }

        .liveSnapshotPrimary {
          order: 1;
        }

        .liveSnapshotSidebar {
          order: 2;
        }

        .desktopBadgeRow {
          display: none !important;
        }

        .mobileBadgeRow {
          display: flex !important;
        }
      }
    `}</style>
    </>
  );
}

function FearGreedGauge({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  const label = clamped < 25 ? 'Extreme fear' : clamped < 45 ? 'Fear' : clamped < 56 ? 'Neutral' : clamped < 76 ? 'Greed' : 'Extreme greed';
  const angle = 180 - (clamped / 100) * 180;
  const radians = (angle * Math.PI) / 180;
  const centerX = 130;
  const centerY = 126;
  const pointerLength = 68;
  const pointerX = centerX + Math.cos(radians) * pointerLength;
  const pointerY = centerY - Math.sin(radians) * pointerLength;

  return (
    <div style={{ borderRadius: 18, padding: 14, background: 'rgba(255,255,255,0.025)', border: '1px solid #2b3655', marginBottom: 14 }}>
      <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 6 }}>Fear & Greed</div>
      <svg viewBox="0 0 260 160" style={{ width: '100%', maxWidth: 240, display: 'block', margin: '0 auto -6px' }}>
        <path d="M 38 126 A 92 92 0 0 1 77 50" stroke="#dc3545" strokeWidth="11" strokeLinecap="round" fill="none" />
        <path d="M 88 41 A 92 92 0 0 1 121 32" stroke="#f59f00" strokeWidth="11" strokeLinecap="round" fill="none" />
        <path d="M 139 32 A 92 92 0 0 1 172 41" stroke="#f6d32d" strokeWidth="11" strokeLinecap="round" fill="none" />
        <path d="M 183 50 A 92 92 0 0 1 222 126" stroke="#7bdc65" strokeWidth="11" strokeLinecap="round" fill="none" />
        <line x1={centerX} y1={centerY} x2={pointerX} y2={pointerY} stroke="#f5f7fb" strokeWidth="4" strokeLinecap="round" opacity="0.95" />
        <circle cx={centerX} cy={centerY} r="7" fill="#f5f7fb" stroke="#0f172a" strokeWidth="2" />
        <text x="130" y="94" textAnchor="middle" fill="#f5f7fb" style={{ fontSize: 36, fontWeight: 800 }}>{clamped}</text>
        <text x="130" y="114" textAnchor="middle" fill="#b4bfd3" style={{ fontSize: 13 }}>{label}</text>
      </svg>
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  const normalized = typeof children === 'string' ? children.toLowerCase() : '';
  const extraTop = normalized === 'market snapshot' || normalized === 'composite inputs';
  return <div style={{ color: '#8ea3c7', textTransform: 'uppercase', letterSpacing: 1.2, fontSize: 11, marginTop: extraTop ? 13 : 8, marginBottom: 4 }}>{children}</div>;
}

function ValueRow({ label, value, trend, help }: { label: string; value: string; trend?: { icon: string; color: string }; help?: string }) {
  const [showHelp, setShowHelp] = useState(false);

  return (
    <div style={{ padding: '10px 0', borderBottom: '1px solid rgba(142,163,199,0.14)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ color: '#8ea3c7', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span>{label}</span>
          {help ? (
            <button
              type="button"
              title={help}
              aria-label={`Explain ${label}`}
              onClick={() => setShowHelp((value) => !value)}
              onTouchEnd={(event) => {
                event.preventDefault();
                setShowHelp((value) => !value);
              }}
              style={{ display: 'inline-flex', width: 20, height: 20, borderRadius: '50%', alignItems: 'center', justifyContent: 'center', border: '1px solid #51617f', color: '#c5d0e7', fontSize: 11, cursor: 'pointer', background: 'rgba(11,16,32,0.72)', padding: 0, touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent', position: 'relative', zIndex: 2, pointerEvents: 'auto' }}
            >
              i
            </button>
          ) : null}
        </div>
        <div style={{ fontWeight: 700, textAlign: 'right', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {trend ? <span style={{ color: trend.color, minWidth: 18, fontWeight: 800, letterSpacing: 0.5 }}>{trend.icon}</span> : null}
          <span>{value}</span>
        </div>
      </div>
      {help && showHelp ? <div style={{ marginTop: 8, color: '#b4bfd3', fontSize: 12, lineHeight: 1.45, paddingRight: 12 }}>{help}</div> : null}
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ borderRadius: 16, padding: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid #2b3655' }}>
      <div style={{ color: '#8ea3c7', textTransform: 'uppercase', letterSpacing: 1.2, fontSize: 11, marginBottom: 6 }}>{label}</div>
      <div style={{ fontWeight: 800, fontSize: 20, lineHeight: 1.2 }}>{value}</div>
    </div>
  );
}

function SignalBar({ label, value, weight, help }: { label: string; value: number; weight?: string; help?: string }) {
  const positive = value >= 0;
  const width = `${Math.min(50, Math.max(6, Math.abs(value) / 2))}%`;
  const [showHelp, setShowHelp] = useState(false);
  return (
    <div style={{ padding: 12, borderRadius: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid #2b3655', marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
        <div style={{ fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span>{label}</span>
          {weight ? <span style={{ color: '#8ea3c7', fontSize: 12, fontWeight: 600 }}>{weight}</span> : null}
          {help ? (
            <button
              type="button"
              title={help}
              aria-label={`Explain ${label}`}
              onClick={() => setShowHelp((value) => !value)}
              onTouchEnd={(event) => {
                event.preventDefault();
                setShowHelp((value) => !value);
              }}
              style={{ display: 'inline-flex', width: 20, height: 20, borderRadius: '50%', alignItems: 'center', justifyContent: 'center', border: '1px solid #51617f', color: '#c5d0e7', fontSize: 11, cursor: 'pointer', background: 'rgba(11,16,32,0.72)', padding: 0, touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent', position: 'relative', zIndex: 2, pointerEvents: 'auto' }}
            >
              i
            </button>
          ) : null}
        </div>
        <div style={{ color: positive ? '#86efac' : '#fca5a5', fontWeight: 700 }}>{formatWholeSignedNumber(value)}</div>
      </div>
      <div style={{ position: 'relative', height: 13, borderRadius: 999, background: '#0c1327', overflow: 'hidden', border: '1px solid #26304b' }}>
        <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: '#44506d' }} />
        <div style={{ position: 'absolute', top: 0, bottom: 0, [positive ? 'left' : 'right']: '50%', width, background: positive ? 'linear-gradient(90deg, #2bd67b, #7fffb2)' : 'linear-gradient(90deg, #f36d6d, #ffb0b0)' }} />
      </div>
      {help && showHelp ? <div style={{ marginTop: 8, color: '#b4bfd3', fontSize: 12, lineHeight: 1.45, paddingRight: 12 }}>{help}</div> : null}
    </div>
  );
}

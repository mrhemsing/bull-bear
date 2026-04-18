import type { CompositeMarketSnapshot, StateManifestEntry } from '@/lib/types';

function formatSignedNumber(value?: number, digits = 2) {
  if (value === undefined || value === null || Number.isNaN(value)) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(digits)}`;
}

export function DebugPanel({
  snapshot,
  manifest,
  previousStateIndex
}: {
  snapshot: CompositeMarketSnapshot;
  manifest: StateManifestEntry | null;
  previousStateIndex?: number;
}) {
  const stateDelta = previousStateIndex === undefined
    ? 'First tracked state'
    : `${snapshot.stateIndex - previousStateIndex > 0 ? '+' : ''}${snapshot.stateIndex - previousStateIndex} bands`;

  return (
    <section style={{ background: '#121931', borderRadius: 18, padding: 18, border: '1px solid #24304f', marginBottom: 28 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <div style={{ color: '#8ea3c7', textTransform: 'uppercase', letterSpacing: 1, fontSize: 12, marginBottom: 6 }}>Debug panel</div>
          <h2 style={{ margin: 0 }}>Signal transparency</h2>
        </div>
        <div style={{ color: '#f6d06b', fontWeight: 700 }}>
          {manifest?.label ?? snapshot.stateLabel} · state {snapshot.stateIndex}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 16 }}>
        <div style={{ display: 'grid', gap: 12 }}>
          <ContributionRow label="Fear & Greed" raw={String(snapshot.fearAndGreed)} score={snapshot.fearGreedScore} weight="18 pts" contribution={snapshot.fearGreedScore} />
          <ContributionRow label="Coinbase spot regime" raw={`24h ${formatSignedNumber(snapshot.priceChange24h)}% · 7d ${formatSignedNumber(snapshot.priceChange7d)}%`} score={snapshot.marketBiasScore} weight="35 pts" contribution={snapshot.marketBiasScore} />
          <ContributionRow label="Coinbase momentum" raw={`1h ${formatSignedNumber(snapshot.percentChange1h)}% · RSI, MACD, and latest Coinbase impulse`} score={snapshot.momentumScore} weight="22 pts" contribution={snapshot.momentumScore} />
          <ContributionRow label="Binance positioning" raw={`Funding ${formatSignedNumber(snapshot.fundingRate)}% · Basis ${formatSignedNumber(snapshot.basisPct)}% · OI ${formatSignedNumber(snapshot.openInterestChangePct1h)}% · Taker ${formatSignedNumber(snapshot.takerBuySellRatio, 3)}`} score={snapshot.derivativesScore} weight="25 pts" contribution={snapshot.derivativesScore} />
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          <DebugMetric label="Composite score" value={formatSignedNumber(snapshot.finalScore)} />
          <DebugMetric label="1h BTC move" value={formatSignedNumber(snapshot.percentChange1h) + '%'} />
          <DebugMetric label="Resolved band" value={`${snapshot.stateIndex} · ${snapshot.stateLabel}`} />
          <DebugMetric label="Band range" value={manifest ? `${manifest.scoreMin} to ${manifest.scoreMax}` : '—'} />
          <DebugMetric label="Previous saved state" value={previousStateIndex ? String(previousStateIndex) : 'None'} />
          <DebugMetric label="State delta" value={stateDelta} />
          <DebugMetric label="Source" value={snapshot.source} />
          <DebugMetric label="Manifest asset id" value={manifest?.id ?? 'None'} />
        </div>
      </div>
    </section>
  );
}

function ContributionRow({
  label,
  raw,
  score,
  weight,
  contribution,
  suffix = ''
}: {
  label: string;
  raw: string;
  score: number;
  weight: string;
  contribution: number;
  suffix?: string;
}) {
  const normalizedWidth = `${Math.min(100, Math.abs(contribution))}%`;
  const isPositive = contribution >= 0;

  return (
    <div style={{ padding: 14, borderRadius: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid #2b3655' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
        <div>
          <div style={{ fontWeight: 700 }}>{label}</div>
          <div style={{ color: '#8ea3c7', fontSize: 13 }}>Raw input: {raw}{suffix}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: '#8ea3c7', fontSize: 12 }}>Weight {weight}</div>
          <div style={{ fontWeight: 700 }}>{formatSignedNumber(score)}</div>
        </div>
      </div>

      <div style={{ height: 10, borderRadius: 999, background: '#0c1327', overflow: 'hidden', border: '1px solid #26304b', marginBottom: 8 }}>
        <div
          style={{
            height: '100%',
            width: normalizedWidth,
            background: isPositive ? 'linear-gradient(90deg, #2bd67b, #7fffb2)' : 'linear-gradient(90deg, #f36d6d, #ffb0b0)'
          }}
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
        <span style={{ color: '#8ea3c7' }}>Weighted contribution</span>
        <span style={{ fontWeight: 700, color: isPositive ? '#7fffb2' : '#ffb0b0' }}>{formatSignedNumber(contribution)}</span>
      </div>
    </div>
  );
}

function DebugMetric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid #2b3655' }}>
      <div style={{ color: '#8ea3c7', fontSize: 12, marginBottom: 4 }}>{label}</div>
      <div style={{ fontWeight: 700, wordBreak: 'break-word' }}>{value}</div>
    </div>
  );
}

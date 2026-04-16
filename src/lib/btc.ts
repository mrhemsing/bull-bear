import stateManifest from '@/../data/state-manifest.json';
import type { CompositeMarketSnapshot, StateManifestEntry } from './types';

const COINBASE_CANDLES_URL = 'https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=3600';
const FEAR_AND_GREED_URL = 'https://api.alternative.me/fng/?limit=1';
const BINANCE_PREMIUM_INDEX_URL = 'https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT';
const BINANCE_BASIS_URL = 'https://fapi.binance.com/futures/data/basis?pair=BTCUSDT&contractType=PERPETUAL&period=1h&limit=2';
const BINANCE_OPEN_INTEREST_URL = 'https://fapi.binance.com/futures/data/openInterestHist?symbol=BTCUSDT&period=5m&limit=13';
const BINANCE_TAKER_RATIO_URL = 'https://fapi.binance.com/futures/data/takerlongshortRatio?symbol=BTCUSDT&period=5m&limit=12';

const STATE_MANIFEST = stateManifest as StateManifestEntry[];

type Candle = {
  time: number;
  low: number;
  high: number;
  open: number;
  close: number;
  volume: number;
};

type BinancePremiumIndex = {
  markPrice?: string;
  indexPrice?: string;
  lastFundingRate?: string;
  time?: number;
};

type BinanceBasisPoint = {
  basisRate?: string;
  basis?: string;
  futuresPrice?: string;
  indexPrice?: string;
  timestamp?: number;
};

type BinanceOpenInterestPoint = {
  sumOpenInterestValue?: string;
  timestamp?: number;
};

type BinanceTakerRatioPoint = {
  buySellRatio?: string;
  timestamp?: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function resolveState(score: number): StateManifestEntry {
  const match = STATE_MANIFEST.find((entry) => score >= entry.scoreMin && score <= entry.scoreMax);
  if (!match) return score < 0 ? STATE_MANIFEST[0] : STATE_MANIFEST[STATE_MANIFEST.length - 1];
  return match;
}

function scoreBand(value: number, low: number, high: number) {
  if (value <= low) return -1;
  if (value >= high) return 1;
  return ((value - low) / (high - low)) * 2 - 1;
}

function calculateEma(values: number[], period: number) {
  if (values.length < period) return values[values.length - 1] ?? 0;
  const multiplier = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  for (const value of values.slice(period)) {
    ema = (value - ema) * multiplier + ema;
  }
  return ema;
}

function calculateRsi(values: number[], period = 14) {
  if (values.length <= period) return 50;
  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i += 1) {
    const change = values[i] - values[i - 1];
    if (change >= 0) gains += change;
    else losses += Math.abs(change);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < values.length; i += 1) {
    const change = values[i] - values[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    avgGain = ((avgGain * (period - 1)) + gain) / period;
    avgLoss = ((avgLoss * (period - 1)) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calculateMacdHistogram(values: number[]) {
  if (values.length < 35) return 0;
  const ema12Series: number[] = [];
  const ema26Series: number[] = [];

  let ema12 = calculateEma(values.slice(0, 12), 12);
  let ema26 = calculateEma(values.slice(0, 26), 26);
  const mult12 = 2 / (12 + 1);
  const mult26 = 2 / (26 + 1);

  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (i >= 11) {
      if (i === 11) ema12 = values.slice(0, 12).reduce((sum, n) => sum + n, 0) / 12;
      else ema12 = (value - ema12) * mult12 + ema12;
      ema12Series.push(ema12);
    }

    if (i >= 25) {
      if (i === 25) ema26 = values.slice(0, 26).reduce((sum, n) => sum + n, 0) / 26;
      else ema26 = (value - ema26) * mult26 + ema26;
      ema26Series.push(ema26);
    }
  }

  const macdLine: number[] = [];
  for (let i = 0; i < ema26Series.length; i += 1) {
    macdLine.push(ema12Series[i + (26 - 12)] - ema26Series[i]);
  }

  const signal = calculateEma(macdLine, 9);
  return macdLine[macdLine.length - 1] - signal;
}

function calculateFearGreedScore(fearGreed: number, marketBiasScore: number, momentumScore: number, derivativesScore: number) {
  const baseline = scoreBand(fearGreed, 30, 70) * 18;

  if (fearGreed <= 25) {
    const recoverySupport = clamp(((Math.max(0, marketBiasScore) * 0.45) + (Math.max(0, momentumScore) * 0.35) + (Math.max(0, derivativesScore) * 0.2)) / 40, 0, 1);
    return clamp((baseline * 0.85) + (recoverySupport * 5), -18, 18);
  }

  if (fearGreed >= 75) {
    const overheatingPenalty = clamp(((Math.max(0, derivativesScore) * -0.25) + (Math.max(0, momentumScore) * -0.15)), -4, 0);
    return clamp(baseline + overheatingPenalty, -18, 18);
  }

  return clamp(baseline, -18, 18);
}

async function fetchJson<T>(url: string) {
  const response = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': 'openclaw-bull-bear' },
    next: { revalidate: 60 }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

function getFallbackCompositeMarketSnapshot(): CompositeMarketSnapshot {
  const fallbackScore = 0;
  const state = resolveState(fallbackScore);

  return {
    timestamp: new Date().toISOString(),
    source: 'Fallback snapshot (live market sources temporarily unavailable)',
    currentPrice: 0,
    ma7: 0,
    ma30: 0,
    priceChange24h: 0,
    priceChange7d: 0,
    fearAndGreed: 50,
    fearGreedScore: 0,
    marketBiasScore: 0,
    momentumScore: 0,
    derivativesScore: 0,
    sentimentScore: 0,
    trend7Score: 0,
    trend30Score: 0,
    fundingRate: 0,
    basisPct: 0,
    openInterestChangePct1h: 0,
    takerBuySellRatio: 1,
    finalScore: fallbackScore,
    stateIndex: state.index,
    stateLabel: state.label,
    stateId: state.id
  };
}

async function getCoinbaseCandles() {
  const data = await fetchJson<Array<[number, string, string, string, string, string] | [number, number, number, number, number, number]>>(COINBASE_CANDLES_URL);
  return [...data]
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map((candle) => ({
      time: Number(candle[0]),
      low: Number(candle[1]),
      high: Number(candle[2]),
      open: Number(candle[3]),
      close: Number(candle[4]),
      volume: Number(candle[5])
    })) as Candle[];
}

export async function getCompositeMarketSnapshot(): Promise<CompositeMarketSnapshot> {
  const [candlesResult, fearGreedResult, premiumIndexResult, basisResult, openInterestResult, takerRatioResult] = await Promise.allSettled([
    getCoinbaseCandles(),
    fetchJson<{ data?: Array<{ value?: string; value_classification?: string }> }>(FEAR_AND_GREED_URL),
    fetchJson<BinancePremiumIndex>(BINANCE_PREMIUM_INDEX_URL),
    fetchJson<BinanceBasisPoint[]>(BINANCE_BASIS_URL),
    fetchJson<BinanceOpenInterestPoint[]>(BINANCE_OPEN_INTEREST_URL),
    fetchJson<BinanceTakerRatioPoint[]>(BINANCE_TAKER_RATIO_URL)
  ]);

  if (candlesResult.status !== 'fulfilled') {
    console.error('Falling back to neutral composite market snapshot: Coinbase candles unavailable', candlesResult.reason);
    return getFallbackCompositeMarketSnapshot();
  }

  const candles = candlesResult.value;
  const fearGreedData = fearGreedResult.status === 'fulfilled' ? fearGreedResult.value : null;
  const premiumIndex = premiumIndexResult.status === 'fulfilled' ? premiumIndexResult.value : null;
  const basisPoints = basisResult.status === 'fulfilled' ? basisResult.value : [];
  const openInterestPoints = openInterestResult.status === 'fulfilled' ? openInterestResult.value : [];
  const takerRatioPoints = takerRatioResult.status === 'fulfilled' ? takerRatioResult.value : [];

  if (fearGreedResult.status !== 'fulfilled') {
    console.error('Fear & Greed unavailable, continuing with a neutral top-line overlay while spot and derivatives stay live:', fearGreedResult.reason);
  }

  if (premiumIndexResult.status !== 'fulfilled' || basisResult.status !== 'fulfilled' || openInterestResult.status !== 'fulfilled' || takerRatioResult.status !== 'fulfilled') {
    console.error('One or more Binance derivatives inputs were unavailable, continuing with neutralized derivatives components.', {
      premiumIndex: premiumIndexResult.status,
      basis: basisResult.status,
      openInterest: openInterestResult.status,
      takerRatio: takerRatioResult.status
    });
  }

  const closes = candles.map((candle) => candle.close);
  const currentPrice = closes[closes.length - 1] ?? 0;
  const ema200 = calculateEma(closes, 200);
  const rsi14 = calculateRsi(closes, 14);
  const macdHistogram = calculateMacdHistogram(closes);
  const ma7 = closes.slice(-7).reduce((sum, value) => sum + value, 0) / Math.min(7, closes.length);
  const ma30 = closes.slice(-30).reduce((sum, value) => sum + value, 0) / Math.min(30, closes.length);
  const close24hAgo = closes[Math.max(0, closes.length - 25)] ?? currentPrice;
  const close7dAgo = closes[Math.max(0, closes.length - 24 * 7 - 1)] ?? close24hAgo;
  const priceChange24h = close24hAgo > 0 ? ((currentPrice - close24hAgo) / close24hAgo) * 100 : 0;
  const priceChange7d = close7dAgo > 0 ? ((currentPrice - close7dAgo) / close7dAgo) * 100 : 0;

  const fundingRate = Number(premiumIndex?.lastFundingRate ?? 0);
  const markPrice = Number(premiumIndex?.markPrice ?? currentPrice);
  const indexPrice = Number(premiumIndex?.indexPrice ?? currentPrice);
  const latestBasisPoint = basisPoints[basisPoints.length - 1];
  const basisPct = Number(latestBasisPoint?.basisRate ?? (indexPrice > 0 ? (markPrice - indexPrice) / indexPrice : 0)) * 100;
  const previousOi = Number(openInterestPoints[0]?.sumOpenInterestValue ?? 0);
  const latestOi = Number(openInterestPoints[openInterestPoints.length - 1]?.sumOpenInterestValue ?? previousOi);
  const oiChangePct1h = previousOi > 0 ? ((latestOi - previousOi) / previousOi) * 100 : 0;
  const takerRatios = takerRatioPoints.map((point) => Number(point.buySellRatio ?? 1)).filter((value) => Number.isFinite(value) && value > 0);
  const takerBuySellRatio = takerRatios.length ? takerRatios.reduce((sum, value) => sum + value, 0) / takerRatios.length : 1;
  const fearGreed = Number(fearGreedData?.data?.[0]?.value ?? 50);

  const regimeScore = scoreBand(ema200 > 0 ? ((currentPrice - ema200) / ema200) * 100 : 0, -4, 4);
  const dayScore = scoreBand(priceChange24h, -3, 3);
  const weekScore = scoreBand(priceChange7d, -8, 8);
  const marketBiasScore = Math.round(((regimeScore * 0.45) + (dayScore * 0.2) + (weekScore * 0.35)) * 32);

  const macdScore = scoreBand(macdHistogram, -120, 120);
  const rsiScore = scoreBand(rsi14, 42, 58);
  const hourlyImpulse = scoreBand(closes.length > 1 && closes[closes.length - 2] > 0 ? ((currentPrice - closes[closes.length - 2]) / closes[closes.length - 2]) * 100 : 0, -0.9, 0.9);
  const momentumScore = Math.round(((macdScore * 0.45) + (rsiScore * 0.35) + (hourlyImpulse * 0.2)) * 24);

  const fundingScore = scoreBand(fundingRate * 100, -0.03, 0.03);
  const basisScore = scoreBand(basisPct, -0.08, 0.08);
  const openInterestScore = scoreBand(oiChangePct1h, -2.5, 2.5);
  const takerScore = scoreBand(takerBuySellRatio, 0.94, 1.06);
  const derivativesScore = Math.round(((fundingScore * 0.2) + (basisScore * 0.25) + (openInterestScore * 0.3) + (takerScore * 0.25)) * 26);

  const fearGreedScore = Math.round(calculateFearGreedScore(fearGreed, marketBiasScore, momentumScore, derivativesScore));

  const finalScore = Math.round(clamp(
    (fearGreedScore * 1) +
    (marketBiasScore * 1.1) +
    (momentumScore * 0.95) +
    (derivativesScore * 1.05),
    -100,
    100
  ));

  const state = resolveState(finalScore);
  const sentimentScore = Math.round(clamp(fearGreedScore, -100, 100));
  const trend7Score = Math.round(clamp((marketBiasScore * 0.7) + (momentumScore * 0.3), -100, 100));
  const trend30Score = Math.round(clamp((marketBiasScore * 0.55) + (derivativesScore * 0.45), -100, 100));
  const latestTimestamp = Math.max(
    (candles[candles.length - 1]?.time ?? 0) * 1000,
    premiumIndex?.time ?? 0,
    latestBasisPoint?.timestamp ?? 0,
    openInterestPoints[openInterestPoints.length - 1]?.timestamp ?? 0,
    takerRatioPoints[takerRatioPoints.length - 1]?.timestamp ?? 0,
    Date.now()
  );

  return {
    timestamp: new Date(latestTimestamp).toISOString(),
    source: 'Coinbase spot candles + Binance futures positioning + Alternative.me Fear & Greed',
    currentPrice: Number(currentPrice.toFixed(2)),
    ma7: Number(ma7.toFixed(2)),
    ma30: Number(ma30.toFixed(2)),
    priceChange24h: Number(priceChange24h.toFixed(2)),
    priceChange7d: Number(priceChange7d.toFixed(2)),
    fearAndGreed: fearGreed,
    fearGreedScore,
    marketBiasScore,
    momentumScore,
    derivativesScore,
    sentimentScore,
    trend7Score,
    trend30Score,
    fundingRate: Number((fundingRate * 100).toFixed(4)),
    basisPct: Number(basisPct.toFixed(4)),
    openInterestChangePct1h: Number(oiChangePct1h.toFixed(2)),
    takerBuySellRatio: Number(takerBuySellRatio.toFixed(3)),
    finalScore,
    stateIndex: state.index,
    stateLabel: state.label,
    stateId: state.id
  };
}

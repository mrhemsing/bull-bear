import stateManifest from '@/../data/state-manifest.json';
import type { CompositeMarketSnapshot, StateManifestEntry } from './types';

const COINBASE_CANDLES_URL = 'https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=3600';
const BINANCE_PREMIUM_URL = 'https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT';
const BINANCE_OPEN_INTEREST_URL = 'https://fapi.binance.com/fapi/v1/openInterest?symbol=BTCUSDT';
const BINANCE_OPEN_INTEREST_HIST_URL = 'https://fapi.binance.com/futures/data/openInterestHist?symbol=BTCUSDT&period=1h&limit=2';
const BINANCE_TAKER_RATIO_URL = 'https://fapi.binance.com/futures/data/takerlongshortRatio?symbol=BTCUSDT&period=1h&limit=2';
const FEAR_AND_GREED_URL = 'https://api.alternative.me/fng/?limit=1';

const STATE_MANIFEST = stateManifest as StateManifestEntry[];

type Candle = {
  time: number;
  low: number;
  high: number;
  open: number;
  close: number;
  volume: number;
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

function calculateFearGreedScore(fearGreed: number, momentumScore: number, marketBiasScore: number) {
  const baseline = scoreBand(fearGreed, 35, 65) * 15;

  if (fearGreed <= 20) {
    const recoverySupport = clamp(((Math.max(0, momentumScore) * 0.7) + (Math.max(0, marketBiasScore) * 0.3)) / 35, 0, 1);
    const bearishPenalty = Math.min(10, Math.abs(baseline) * 0.5);
    const contrarianBoost = recoverySupport * 6;
    return clamp(baseline + bearishPenalty + contrarianBoost, -15, 15);
  }

  return clamp(baseline, -15, 15);
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
  const [candles, premium, openInterestNow, openInterestHist, takerData, fearGreedData] = await Promise.all([
    getCoinbaseCandles(),
    fetchJson<{ markPrice: string; indexPrice: string; lastFundingRate: string }>(BINANCE_PREMIUM_URL),
    fetchJson<{ openInterest: string }>(BINANCE_OPEN_INTEREST_URL),
    fetchJson<Array<{ sumOpenInterestValue: string }>>(BINANCE_OPEN_INTEREST_HIST_URL),
    fetchJson<Array<{ buySellRatio?: string; buyVol?: string; sellVol?: string }>>(BINANCE_TAKER_RATIO_URL),
    fetchJson<{ data?: Array<{ value?: string; value_classification?: string }> }>(FEAR_AND_GREED_URL)
  ]);

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

  const fundingRate = Number(premium.lastFundingRate);
  const markPrice = Number(premium.markPrice);
  const indexPrice = Number(premium.indexPrice);
  const basisPct = indexPrice > 0 ? ((markPrice - indexPrice) / indexPrice) * 100 : 0;
  const oiNow = Number(openInterestNow.openInterest);
  const oiPrev = Number(openInterestHist?.[0]?.sumOpenInterestValue ?? 0);
  const oiCurr = Number(openInterestHist?.[1]?.sumOpenInterestValue ?? (oiPrev || oiNow));
  const oiChangePct1h = oiPrev > 0 ? ((oiCurr - oiPrev) / oiPrev) * 100 : 0;

  const latestTaker = takerData?.[takerData.length - 1];
  const takerBuySellRatio = latestTaker?.buySellRatio
    ? Number(latestTaker.buySellRatio)
    : (Number(latestTaker?.buyVol ?? 0) > 0 && Number(latestTaker?.sellVol ?? 0) > 0)
      ? Number(latestTaker?.buyVol) / Number(latestTaker?.sellVol)
      : 1;

  const fearGreed = Number(fearGreedData.data?.[0]?.value ?? 50);

  const regimeScore = scoreBand(ema200 > 0 ? ((currentPrice - ema200) / ema200) * 100 : 0, -4, 4);
  const dayScore = scoreBand(priceChange24h, -3, 3);
  const weekScore = scoreBand(priceChange7d, -8, 8);
  const marketBiasScore = Math.round(((regimeScore * 0.45) + (dayScore * 0.2) + (weekScore * 0.35)) * 35);

  const macdScore = scoreBand(macdHistogram, -120, 120);
  const rsiScore = scoreBand(rsi14, 42, 58);
  const momentumScore = Math.round(((macdScore * 0.55) + (rsiScore * 0.45)) * 25);
  const fearGreedScore = Math.round(calculateFearGreedScore(fearGreed, momentumScore, marketBiasScore));

  const fundingScore = fundingRate > 0.0005
    ? -0.8
    : fundingRate < -0.0005
      ? 0.8
      : scoreBand(fundingRate, -0.00015, 0.00015);
  const basisScore = scoreBand(basisPct, -0.08, 0.08);
  const openInterestScore = scoreBand(oiChangePct1h, -2.5, 2.5);
  const takerScore = scoreBand(takerBuySellRatio, 0.96, 1.04);
  const derivativesScore = Math.round(((fundingScore * 0.3) + (basisScore * 0.2) + (openInterestScore * 0.3) + (takerScore * 0.2)) * 25);

  const finalScore = Math.round(clamp(marketBiasScore + momentumScore + derivativesScore + fearGreedScore, -100, 100));

  const state = resolveState(finalScore);
  const sentimentScore = Math.round(clamp(derivativesScore + fearGreedScore, -100, 100));
  const trend7Score = marketBiasScore;
  const trend30Score = momentumScore;
  const latestTimestamp = (candles[candles.length - 1]?.time ?? Math.floor(Date.now() / 1000)) * 1000;

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

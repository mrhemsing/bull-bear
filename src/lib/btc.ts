import stateManifest from '@/../data/state-manifest.json';
import type { CompositeMarketSnapshot, StateManifestEntry } from './types';

const COINGECKO_MARKET_CHART_DAILY_URL = 'https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=90&interval=daily';
const FEAR_AND_GREED_URL = 'https://api.alternative.me/fng/';

const STATE_MANIFEST = stateManifest as StateManifestEntry[];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function resolveState(score: number): StateManifestEntry {
  const match = STATE_MANIFEST.find((entry) => score >= entry.scoreMin && score <= entry.scoreMax);

  if (!match) {
    return score < 0 ? STATE_MANIFEST[0] : STATE_MANIFEST[STATE_MANIFEST.length - 1];
  }

  return match;
}

export async function getCompositeMarketSnapshot(): Promise<CompositeMarketSnapshot> {
  const [priceResponse, fngResponse] = await Promise.all([
    fetch(COINGECKO_MARKET_CHART_DAILY_URL, {
      headers: { accept: 'application/json' },
      next: { revalidate: 300 }
    }),
    fetch(FEAR_AND_GREED_URL, {
      headers: { accept: 'application/json' },
      next: { revalidate: 300 }
    })
  ]);

  if (!priceResponse.ok) {
    throw new Error(`Failed to fetch BTC daily history from CoinGecko: ${priceResponse.status} ${priceResponse.statusText}`);
  }

  if (!fngResponse.ok) {
    throw new Error(`Failed to fetch Fear & Greed index: ${fngResponse.status} ${fngResponse.statusText}`);
  }

  const priceData = (await priceResponse.json()) as { prices?: [number, number][] };
  const fngData = (await fngResponse.json()) as { data?: Array<{ value?: string }> };

  const prices = priceData.prices ?? [];
  if (prices.length < 30) {
    throw new Error('CoinGecko returned insufficient daily BTC history for MA30 calculation.');
  }

  const closes = prices.map(([, price]) => Number(price.toFixed(2)));
  const currentPrice = closes[closes.length - 1];
  const ma7 = Number(average(closes.slice(-7)).toFixed(2));
  const ma30 = Number(average(closes.slice(-30)).toFixed(2));

  const fngRaw = Number(fngData.data?.[0]?.value ?? NaN);
  if (!Number.isFinite(fngRaw)) {
    throw new Error('Fear & Greed API returned an invalid value.');
  }

  const sentimentScore = Number(((fngRaw - 50) * 2).toFixed(2));
  const trend7Pct = ((currentPrice / ma7) - 1) * 100;
  const trend30Pct = ((currentPrice / ma30) - 1) * 100;
  const trend7Score = Number(clamp(trend7Pct * 8, -100, 100).toFixed(2));
  const trend30Score = Number(clamp(trend30Pct * 5, -100, 100).toFixed(2));
  const finalScore = Number(clamp(
    sentimentScore * 0.35 + trend7Score * 0.4 + trend30Score * 0.25,
    -100,
    100
  ).toFixed(2));

  const state = resolveState(finalScore);
  const latestTimestamp = prices[prices.length - 1]?.[0] ?? Date.now();

  return {
    timestamp: new Date(latestTimestamp).toISOString(),
    source: 'Fear & Greed API + CoinGecko daily BTC market_chart',
    currentPrice,
    ma7,
    ma30,
    fearAndGreed: fngRaw,
    sentimentScore,
    trend7Score,
    trend30Score,
    finalScore,
    stateIndex: state.index,
    stateLabel: state.label,
    stateId: state.id
  };
}

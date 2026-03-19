import type { MarketSnapshot } from './types';

const COINGECKO_MARKET_CHART_URL = 'https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=1&interval=hourly';

function calculatePercentChange(currentPrice: number, previousPrice: number) {
  return Number((((currentPrice - previousPrice) / previousPrice) * 100).toFixed(2));
}

export async function getBitcoinSnapshot(): Promise<MarketSnapshot> {
  const response = await fetch(COINGECKO_MARKET_CHART_URL, {
    headers: {
      accept: 'application/json'
    },
    next: { revalidate: 300 }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch BTC data from CoinGecko: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as { prices?: [number, number][] };
  const prices = data.prices ?? [];

  if (prices.length < 2) {
    throw new Error('CoinGecko returned insufficient hourly BTC data.');
  }

  const [previousTimestamp, previousPrice] = prices[prices.length - 2];
  const [currentTimestamp, currentPrice] = prices[prices.length - 1];

  return {
    currentPrice: Number(currentPrice.toFixed(2)),
    previousPrice: Number(previousPrice.toFixed(2)),
    percentChange1h: calculatePercentChange(currentPrice, previousPrice),
    timestamp: new Date(currentTimestamp).toISOString(),
    source: `CoinGecko hourly market_chart (previous point at ${new Date(previousTimestamp).toISOString()})`
  };
}

import type { MarketSnapshot } from './types';

export async function getBitcoinSnapshot(): Promise<MarketSnapshot> {
  const now = new Date();

  return {
    currentPrice: 82000,
    previousPrice: 81250,
    percentChange1h: Number((((82000 - 81250) / 81250) * 100).toFixed(2)),
    timestamp: now.toISOString()
  };
}

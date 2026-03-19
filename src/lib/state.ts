import type { CreatureState, MarketDirection, VisualStage } from './types';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function directionFromPercent(percentChange1h: number): MarketDirection {
  if (percentChange1h > 0.05) return 'bull';
  if (percentChange1h < -0.05) return 'bear';
  return 'neutral';
}

export function stageFromSignedScore(score: number): VisualStage {
  if (score <= -0.85) return 'max-bear';
  if (score <= -0.55) return 'very-bear';
  if (score <= -0.2) return 'strong-bear';
  if (score < 0.2) return 'hybrid';
  if (score < 0.55) return 'strong-bull';
  if (score < 0.85) return 'very-bull';
  return 'max-bull';
}

export function mapPercentToCreatureState(percentChange1h: number): CreatureState {
  const direction = directionFromPercent(percentChange1h);
  const signedScore = clamp(percentChange1h / 3, -1, 1);
  const intensity = Math.round(Math.abs(signedScore) * 100);
  const stage = stageFromSignedScore(signedScore);

  return {
    direction,
    intensity,
    stage,
    signedScore
  };
}

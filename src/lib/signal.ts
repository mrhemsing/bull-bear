import stateManifest from '@/../data/state-manifest.json';
import type { CompositeMarketSnapshot, StateManifestEntry } from './types';

const STATE_MANIFEST = stateManifest as StateManifestEntry[];

export function mapCompositeScoreToManifestState(score: number): StateManifestEntry {
  const entry = STATE_MANIFEST.find((state) => score >= state.scoreMin && score <= state.scoreMax);
  if (entry) return entry;
  return score < 0 ? STATE_MANIFEST[0] : STATE_MANIFEST[STATE_MANIFEST.length - 1];
}

export function compositeSnapshotToDirection(snapshot: CompositeMarketSnapshot) {
  if (snapshot.finalScore > 4) return 'bull' as const;
  if (snapshot.finalScore < -4) return 'bear' as const;
  return 'neutral' as const;
}

export function compositeSnapshotToLegacyStage(snapshot: CompositeMarketSnapshot) {
  if (snapshot.finalScore <= -55) return 'max-bear' as const;
  if (snapshot.finalScore <= -25) return 'very-bear' as const;
  if (snapshot.finalScore <= -5) return 'strong-bear' as const;
  if (snapshot.finalScore < 5) return 'hybrid' as const;
  if (snapshot.finalScore < 35) return 'strong-bull' as const;
  if (snapshot.finalScore < 65) return 'very-bull' as const;
  return 'max-bull' as const;
}

export function compositeSnapshotToCreatureState(snapshot: CompositeMarketSnapshot) {
  return {
    direction: compositeSnapshotToDirection(snapshot),
    intensity: Math.round(Math.min(100, Math.abs(snapshot.finalScore))),
    stage: compositeSnapshotToLegacyStage(snapshot),
    signedScore: Number((snapshot.finalScore / 100).toFixed(2))
  };
}

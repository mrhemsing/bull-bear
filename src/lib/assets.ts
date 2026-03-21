import type { FrameRecord, StateManifestEntry } from './types';

export interface ResolvedStateAssets {
  still: string;
  loops: string[];
  activeLoop: string | null;
  loopVariantIndex: number | null;
  source: 'manifest' | 'history-fallback' | 'placeholder';
}

export function resolveStateAssets(params: {
  manifest: StateManifestEntry | null;
  latestTransition: FrameRecord | null;
  timestamp: string;
}): ResolvedStateAssets {
  const { manifest, latestTransition, timestamp } = params;

  if (manifest) {
    const loops = manifest.loops ?? [];
    const loopVariantIndex = loops.length ? resolveLoopVariantIndex(timestamp, loops.length) : null;

    return {
      still: manifest.still,
      loops,
      activeLoop: loopVariantIndex === null ? null : loops[loopVariantIndex] ?? null,
      loopVariantIndex,
      source: 'manifest'
    };
  }

  if (latestTransition?.imageUrl) {
    return {
      still: latestTransition.imageUrl,
      loops: [],
      activeLoop: null,
      loopVariantIndex: null,
      source: 'history-fallback'
    };
  }

  return {
    still: '/frames/pending.png',
    loops: [],
    activeLoop: null,
    loopVariantIndex: null,
    source: 'placeholder'
  };
}

export function resolveLoopVariantIndex(timestamp: string, loopCount: number) {
  if (loopCount <= 0) return null;

  const epoch = Date.parse(timestamp);
  if (Number.isNaN(epoch)) return 0;

  const hours = Math.floor(epoch / (1000 * 60 * 60));
  return ((hours % loopCount) + loopCount) % loopCount;
}

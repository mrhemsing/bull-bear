import fs from 'node:fs';
import path from 'node:path';
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
    const flatAssets = resolveFlatStateAssets(manifest.index);
    const loops = flatAssets?.loops?.length ? flatAssets.loops : (manifest.loops ?? []);
    const still = flatAssets?.still ?? manifest.still;
    const loopVariantIndex = loops.length ? resolveLoopVariantIndex(timestamp, loops.length) : null;

    return {
      still,
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

export function resolveFlatStateAssets(index: number) {
  const baseDir = path.join(process.cwd(), 'public', 'states');
  const key = String(index).padStart(2, '0');
  const stillPath = path.join(baseDir, `${key}.png`);
  const loopCandidates = ['a', 'b', 'c'].map((suffix) => `/states/${key}-${suffix}.mp4`);
  const existingLoops = loopCandidates.filter((loopPath) => fs.existsSync(path.join(process.cwd(), 'public', loopPath.replace(/^\//, ''))));

  if (!fs.existsSync(stillPath) && !existingLoops.length) {
    return null;
  }

  return {
    still: fs.existsSync(stillPath) ? `/states/${key}.png` : null,
    loops: existingLoops
  };
}

export function resolveLoopVariantIndex(timestamp: string, loopCount: number) {
  if (loopCount <= 0) return null;

  const epoch = Date.parse(timestamp);
  if (Number.isNaN(epoch)) return 0;

  const hours = Math.floor(epoch / (1000 * 60 * 60));
  return ((hours % loopCount) + loopCount) % loopCount;
}

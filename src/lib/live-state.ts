import stateManifest from '@/../data/state-manifest.json';
import frames from '@/../data/frames.json';
import { getCompositeMarketSnapshot } from './btc';
import { mediaUrl } from './media-url';
import type { FrameRecord, StateManifestEntry } from './types';
import { compositeSnapshotToCreatureState } from './signal';

const STATE_MANIFEST = stateManifest as StateManifestEntry[];
const FRAMES = frames as FrameRecord[];

function resolveFlatStateAssets(index: number) {
  const key = String(index).padStart(2, '0');
  return {
    still: mediaUrl(`/states/${key}.png`),
    loops: ['a', 'b', 'c'].map((suffix) => mediaUrl(`/states/${key}-${suffix}.mp4`))
  };
}

function resolveLoopVariantIndex(timestamp: string, loopCount: number) {
  if (loopCount <= 0) return null;
  const epoch = Date.parse(timestamp);
  if (Number.isNaN(epoch)) return 0;
  const hours = Math.floor(epoch / (1000 * 60 * 60));
  return ((hours % loopCount) + loopCount) % loopCount;
}

export async function getLiveMarketBeastState() {
  const snapshot = await getCompositeMarketSnapshot();
  const creature = compositeSnapshotToCreatureState(snapshot);
  const manifest = STATE_MANIFEST.find((entry) => entry.index === snapshot.stateIndex) ?? null;
  const history = [...FRAMES].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
  const latestTransition = history[0] ?? null;
  const flatAssets = resolveFlatStateAssets(snapshot.stateIndex);
  const loopVariantIndex = resolveLoopVariantIndex(snapshot.timestamp, flatAssets.loops.length);
  const activeLoop = loopVariantIndex === null ? null : flatAssets.loops[loopVariantIndex] ?? null;

  return {
    snapshot,
    creature,
    manifest: manifest
      ? {
          ...manifest,
          still: flatAssets.still,
          loops: flatAssets.loops
        }
      : null,
    latestTransition,
    history,
    assets: {
      still: flatAssets.still,
      loops: flatAssets.loops,
      activeLoop,
      loopVariantIndex,
      source: 'manifest' as const
    },
    activeStill: flatAssets.still,
    activeLoops: flatAssets.loops,
    activeLoop
  };
}

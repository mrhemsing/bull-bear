import { getCompositeMarketSnapshot } from './btc';
import { resolveStateAssets } from './assets';
import { getFrames, getStateManifestEntry } from './frames';
import { compositeSnapshotToCreatureState } from './signal';

export async function getLiveMarketBeastState() {
  const snapshot = await getCompositeMarketSnapshot();
  const creature = compositeSnapshotToCreatureState(snapshot);
  const manifest = getStateManifestEntry(snapshot.stateIndex);
  const history = getFrames();
  const latestTransition = history[0] ?? null;
  const assets = resolveStateAssets({
    manifest,
    timestamp: snapshot.timestamp
  });

  return {
    snapshot,
    creature,
    manifest,
    latestTransition,
    history,
    assets,
    activeStill: assets.still,
    activeLoops: assets.loops,
    activeLoop: assets.activeLoop
  };
}

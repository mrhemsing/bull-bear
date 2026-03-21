import { resolveStateAssets } from './assets';
import { getCompositeMarketSnapshot } from './btc';
import { getFrames, getLatestFrame, getStateManifestEntry } from './frames';
import { compositeSnapshotToCreatureState } from './signal';

export async function getLiveMarketBeastState() {
  const snapshot = await getCompositeMarketSnapshot();
  const creature = compositeSnapshotToCreatureState(snapshot);
  const manifest = getStateManifestEntry(snapshot.stateIndex);
  const latestTransition = getLatestFrame();
  const history = getFrames();
  const assets = resolveStateAssets({
    manifest,
    latestTransition,
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

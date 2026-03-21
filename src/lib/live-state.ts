import { getCompositeMarketSnapshot } from './btc';
import { getFrames, getLatestFrame, getStateManifestEntry } from './frames';
import { compositeSnapshotToCreatureState } from './signal';

export async function getLiveMarketBeastState() {
  const snapshot = await getCompositeMarketSnapshot();
  const creature = compositeSnapshotToCreatureState(snapshot);
  const manifest = getStateManifestEntry(snapshot.stateIndex);
  const latestTransition = getLatestFrame();
  const history = getFrames();

  return {
    snapshot,
    creature,
    manifest,
    latestTransition,
    history,
    activeStill: manifest?.still ?? latestTransition?.imageUrl ?? '/frames/pending.png',
    activeLoops: manifest?.loops ?? []
  };
}

import { getCompositeMarketSnapshot } from './btc';
import { getStateManifestEntry, saveFrameRecord, shouldPersistFrame } from './frames';
import { buildPromptBundle } from './prompts';
import { compositeSnapshotToCreatureState } from './signal';

function buildCronProofLines(result: {
  stateId: string | null;
  stateLabel: string | null;
  provider: string | null;
  shouldPersist: boolean;
  persisted: boolean;
  failures: string[];
}) {
  const stateLine = result.stateId && result.stateLabel
    ? `state: ${result.stateId} (${result.stateLabel})`
    : 'state: not returned in canonical id+label form';
  const providerLine = result.provider
    ? `provider: ${result.provider}`
    : 'provider: not returned';
  const shouldPersistLine = `shouldPersist: ${result.shouldPersist ? 'true' : 'false'}`;
  const persistedLine = `persisted: ${result.persisted ? 'true' : 'false'}`;
  const failuresLine = result.failures.length > 0
    ? `failures: ${result.failures.join(', ')}`
    : 'failures: none';

  return [stateLine, providerLine, shouldPersistLine, persistedLine, failuresLine];
}

export async function captureMarketState() {
  const snapshot = await getCompositeMarketSnapshot();
  const state = compositeSnapshotToCreatureState(snapshot);
  const prompts = buildPromptBundle(state);
  const manifestEntry = getStateManifestEntry(snapshot.stateIndex);

  const shouldPersist = await shouldPersistFrame({
    stateIndex: snapshot.stateIndex
  });

  const generation = !shouldPersist
    ? {
        provider: 'manifest',
        status: 'not-configured' as const,
        imageUrl: manifestEntry?.still,
        note: manifestEntry
          ? `State did not change, so capture reused Matt's shipped canonical still for ${manifestEntry.id} without persisting a duplicate frame.`
          : 'Canonical state did not change; skipped persistence because the latest saved transition already matches this state and Bull Bear does not generate runtime media.'
      }
    : manifestEntry
      ? {
          provider: 'manifest',
          status: 'configured' as const,
          imageUrl: manifestEntry.still,
          note: `Persisted Matt's shipped canonical still for ${manifestEntry.id}; Bull Bear does not generate runtime media.`
        }
      : {
          provider: 'manifest',
          status: 'not-configured' as const,
          imageUrl: '/frames/pending.png',
          note: 'No shipped canonical still was available for this resolved state, so Bull Bear fell back to the placeholder instead of generating runtime media.'
        };

  const frame = {
    id: snapshot.timestamp,
    timestamp: snapshot.timestamp,
    currentPrice: snapshot.currentPrice,
    previousPrice: snapshot.previousPrice,
    percentChange1h: snapshot.percentChange1h,
    direction: state.direction,
    intensity: state.intensity,
    signedScore: state.signedScore,
    stage: state.stage,
    prompt: prompts.finalPrompt,
    imageUrl: generation.imageUrl ?? '/frames/pending.png',
    provider: generation.provider,
    source: snapshot.source,
    stateIndex: snapshot.stateIndex,
    stateLabel: snapshot.stateLabel,
    finalScore: snapshot.finalScore,
    fearAndGreed: snapshot.fearAndGreed,
    ma7: snapshot.ma7,
    ma30: snapshot.ma30,
    notes: generation.note
  };

  let persisted = false;
  if (shouldPersist) {
    await saveFrameRecord(frame);
    persisted = true;
  }

  const provider = generation.provider ?? frame.provider ?? null;
  const failures: string[] = [];
  const cronProofLines = buildCronProofLines({
    stateId: snapshot.stateId,
    stateLabel: snapshot.stateLabel,
    provider,
    shouldPersist,
    persisted,
    failures
  });

  return {
    snapshot,
    state,
    prompts,
    generation,
    frame,
    shouldPersist,
    persisted,
    provider,
    stateId: snapshot.stateId,
    stateLabel: snapshot.stateLabel,
    failures,
    cronProofLines,
    cronProof: cronProofLines.join('\n')
  };
}

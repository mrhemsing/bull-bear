import { NextResponse } from 'next/server';
import { getCompositeMarketSnapshot } from '@/lib/btc';
import { compositeSnapshotToCreatureState } from '@/lib/signal';
import { buildPromptBundle } from '@/lib/prompts';
import { generateMarketBeastPreview } from '@/lib/image-provider';
import { saveFrameRecord, saveGeneratedImage, shouldPersistFrame } from '@/lib/frames';

export async function POST() {
  try {
    const snapshot = await getCompositeMarketSnapshot();
    const state = compositeSnapshotToCreatureState(snapshot);
    const prompts = buildPromptBundle(state);

    const shouldPersist = await shouldPersistFrame({
      stateIndex: snapshot.stateIndex,
      finalScore: snapshot.finalScore
    });

    const generation = shouldPersist
      ? await generateMarketBeastPreview(prompts)
      : {
          provider: 'manifest',
          status: 'not-configured' as const,
          note: 'Band did not change meaningfully; skipped new generation and persistence.'
        };

    const savedImageUrl = shouldPersist
      ? await saveGeneratedImage({
          timestamp: snapshot.timestamp,
          imageBase64: generation.imageBase64,
          imageMimeType: generation.imageMimeType
        })
      : null;

    const frame = {
      id: snapshot.timestamp,
      timestamp: snapshot.timestamp,
      currentPrice: snapshot.currentPrice,
      previousPrice: snapshot.ma7,
      percentChange1h: snapshot.finalScore,
      direction: state.direction,
      intensity: state.intensity,
      signedScore: state.signedScore,
      stage: state.stage,
      prompt: prompts.finalPrompt,
      imageUrl: savedImageUrl ?? generation.imageUrl ?? '/frames/pending.png',
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

    if (shouldPersist) {
      await saveFrameRecord(frame);
    }

    return NextResponse.json({
      snapshot,
      state,
      prompts,
      generation,
      frame,
      shouldPersist
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown generation failure'
      },
      { status: 500 }
    );
  }
}

import { NextResponse } from 'next/server';
import { getBitcoinSnapshot } from '@/lib/btc';
import { mapPercentToCreatureState } from '@/lib/state';
import { buildPromptBundle } from '@/lib/prompts';
import { generateMarketBeastPreview } from '@/lib/image-provider';
import { saveFrameRecord, saveGeneratedImage } from '@/lib/frames';

export async function POST() {
  try {
    const snapshot = await getBitcoinSnapshot();
    const state = mapPercentToCreatureState(snapshot.percentChange1h);
    const prompts = buildPromptBundle(state);
    const generation = await generateMarketBeastPreview(prompts);

    const savedImageUrl = await saveGeneratedImage({
      timestamp: snapshot.timestamp,
      imageBase64: generation.imageBase64,
      imageMimeType: generation.imageMimeType
    });

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
      imageUrl: savedImageUrl ?? generation.imageUrl ?? '/frames/pending.png',
      provider: generation.provider,
      source: snapshot.source,
      notes: generation.note
    };

    await saveFrameRecord(frame);

    return NextResponse.json({
      snapshot,
      state,
      prompts,
      generation,
      frame
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

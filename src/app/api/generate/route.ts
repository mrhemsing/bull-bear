import { NextResponse } from 'next/server';
import { getBitcoinSnapshot } from '@/lib/btc';
import { mapPercentToCreatureState } from '@/lib/state';
import { buildPromptBundle } from '@/lib/prompts';
import { generateMarketBeastPreview } from '@/lib/image-provider';

export async function POST() {
  try {
    const snapshot = await getBitcoinSnapshot();
    const state = mapPercentToCreatureState(snapshot.percentChange1h);
    const prompts = buildPromptBundle(state);
    const generation = await generateMarketBeastPreview(prompts);

    return NextResponse.json({
      snapshot,
      state,
      prompts,
      generation
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

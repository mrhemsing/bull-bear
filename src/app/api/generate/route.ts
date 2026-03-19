import { NextResponse } from 'next/server';
import { getBitcoinSnapshot } from '@/lib/btc';
import { mapPercentToCreatureState } from '@/lib/state';
import { buildPromptBundle } from '@/lib/prompts';

export async function POST() {
  const snapshot = await getBitcoinSnapshot();
  const state = mapPercentToCreatureState(snapshot.percentChange1h);
  const prompts = buildPromptBundle(state);

  return NextResponse.json({
    snapshot,
    state,
    prompts,
    note: 'Image generation provider not wired yet. This route currently returns the computed generation payload.'
  });
}

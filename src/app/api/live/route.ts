import { NextResponse } from 'next/server';
import { getCompositeMarketSnapshot } from '@/lib/btc';
import { compositeSnapshotToCreatureState } from '@/lib/signal';
import { getStateManifestEntry } from '@/lib/frames';

export async function GET() {
  const snapshot = await getCompositeMarketSnapshot();
  const state = compositeSnapshotToCreatureState(snapshot);
  const manifest = getStateManifestEntry(snapshot.stateIndex);

  return NextResponse.json({
    snapshot,
    state,
    manifest
  });
}

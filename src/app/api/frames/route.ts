import { NextResponse } from 'next/server';
import frames from '@/../data/frames.json';
import stateManifest from '@/../data/state-manifest.json';
import type { FrameRecord, StateManifestEntry } from '@/lib/types';

export async function GET() {
  return NextResponse.json({
    frames: frames as FrameRecord[],
    manifest: stateManifest as StateManifestEntry[]
  });
}

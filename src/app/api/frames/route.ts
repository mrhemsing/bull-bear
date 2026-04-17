import { NextResponse } from 'next/server';
import { getFrames, getStateManifest } from '@/lib/frames';

export async function GET() {
  return NextResponse.json({
    frames: getFrames(),
    manifest: getStateManifest()
  });
}

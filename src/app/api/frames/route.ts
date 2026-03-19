import { NextResponse } from 'next/server';
import { getFrames } from '@/lib/frames';

export async function GET() {
  return NextResponse.json({ frames: getFrames() });
}

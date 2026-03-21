import { NextResponse } from 'next/server';
import { getLiveMarketBeastState } from '@/lib/live-state';

export async function GET() {
  const live = await getLiveMarketBeastState();

  return NextResponse.json(live);
}

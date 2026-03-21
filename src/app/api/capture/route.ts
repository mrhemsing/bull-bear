import { NextResponse } from 'next/server';
import { captureMarketState } from '@/lib/capture';

export async function GET() {
  try {
    const result = await captureMarketState();
    return NextResponse.json({
      mode: 'scheduled-capture',
      ...result
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown capture failure'
      },
      { status: 500 }
    );
  }
}

export async function POST() {
  return GET();
}

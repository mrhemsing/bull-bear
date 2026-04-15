import { NextRequest, NextResponse } from 'next/server';
import { captureMarketState } from '@/lib/capture';

function wantsText(request: NextRequest) {
  const format = request.nextUrl.searchParams.get('format')?.trim().toLowerCase();
  const accept = request.headers.get('accept')?.toLowerCase() ?? '';
  return format === 'text' || accept.includes('text/plain');
}

export async function GET(request: NextRequest) {
  try {
    const result = await captureMarketState();

    if (wantsText(request)) {
      return new NextResponse(result.cronProof, {
        headers: {
          'content-type': 'text/plain; charset=utf-8'
        }
      });
    }

    return NextResponse.json({
      mode: 'scheduled-capture-proof',
      stateId: result.stateId,
      stateLabel: result.stateLabel,
      provider: result.provider,
      shouldPersist: result.shouldPersist,
      persisted: result.persisted,
      failures: result.failures,
      cronProofLines: result.cronProofLines,
      cronProof: result.cronProof
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown capture proof failure'
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}

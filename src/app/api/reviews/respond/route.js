import { NextResponse } from 'next/server';
import { generateAndStoreReviewResponse } from '@/lib/reviewResponses';

export const runtime = 'nodejs';

export async function POST(request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    const saved = await generateAndStoreReviewResponse(payload);
    return NextResponse.json({ data: saved }, { status: 201 });
  } catch (err) {
    if (err?.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Validation failed', details: err.issues },
        { status: 400 },
      );
    }
    // Never leak raw error details (possible API keys in stack traces).
    return NextResponse.json(
      { error: 'Failed to generate review response' },
      { status: 500 },
    );
  }
}

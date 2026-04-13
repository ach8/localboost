import { NextResponse } from 'next/server';
import { reviewInputSchema } from '@/lib/reviewResponses';
import { prisma } from '@/lib/prisma';
import { enqueue } from '@/lib/jobQueue';
import { executeReviewJob } from '@/lib/reviewJobWorker';

export const runtime = 'nodejs';

export async function POST(request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Validate synchronously — reject bad input before creating a job.
  let input;
  try {
    input = reviewInputSchema.parse(payload);
  } catch (err) {
    return NextResponse.json(
      { error: 'Validation failed', details: err.issues },
      { status: 400 },
    );
  }

  try {
    // Create a durable job record so the frontend can poll status
    // even if the Next.js process restarts.
    const job = await prisma.reviewJob.create({
      data: {
        reviewId: input.reviewId,
        inputPayload: input,
        status: 'PENDING',
      },
    });

    // Fire-and-forget — the worker updates the DB record.
    enqueue(job.id, () => executeReviewJob(job.id));

    return NextResponse.json({ jobId: job.id, status: 'PENDING' }, { status: 202 });
  } catch {
    return NextResponse.json(
      { error: 'Failed to create review job' },
      { status: 500 },
    );
  }
}

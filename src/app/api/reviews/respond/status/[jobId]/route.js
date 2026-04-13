import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

export async function GET(_request, { params }) {
  const { jobId } = await params;

  if (!jobId || typeof jobId !== 'string') {
    return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });
  }

  const job = await prisma.reviewJob.findUnique({
    where: { id: jobId },
  });

  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  const response = {
    jobId: job.id,
    status: job.status,
    reviewId: job.reviewId,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };

  if (job.status === 'FAILED') {
    response.errorMessage = job.errorMessage;
  }

  if (job.status === 'COMPLETED' && job.responseId) {
    response.responseId = job.responseId;
  }

  return NextResponse.json({ data: response });
}

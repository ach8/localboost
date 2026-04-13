import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeReviewJob } from '@/lib/reviewJobWorker';
import { ModerationError } from '@/lib/moderation';

function makeMockJobPrisma(jobRecord) {
  const update = vi.fn().mockImplementation(async ({ where, data }) => ({
    ...jobRecord,
    ...data,
    id: where.id,
  }));
  return { client: { reviewJob: { update } }, update };
}

describe('executeReviewJob', () => {
  const jobId = 'job_abc';
  const baseJobRecord = {
    id: jobId,
    reviewId: 'review_123',
    status: 'PENDING',
    inputPayload: {
      reviewId: 'review_123',
      businessName: 'Sunrise Cafe',
      rating: 5,
      comment: 'Great!',
      reviewerName: 'Jane',
    },
    errorMessage: null,
    responseId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks job PROCESSING, runs generate, marks COMPLETED with responseId', async () => {
    const prisma = makeMockJobPrisma(baseJobRecord);
    const generate = vi.fn().mockResolvedValue({ id: 'resp_1', content: 'Thanks!' });

    await executeReviewJob(jobId, {
      prisma: prisma.client,
      generate,
    });

    // First call: PROCESSING
    expect(prisma.update).toHaveBeenCalledTimes(2);
    expect(prisma.update.mock.calls[0][0]).toEqual({
      where: { id: jobId },
      data: { status: 'PROCESSING' },
    });

    // generate called with inputPayload
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0][0]).toEqual(baseJobRecord.inputPayload);

    // Second call: COMPLETED
    expect(prisma.update.mock.calls[1][0]).toEqual({
      where: { id: jobId },
      data: { status: 'COMPLETED', responseId: 'resp_1' },
    });
  });

  it('marks job FAILED with safe message when generate throws a generic error', async () => {
    const prisma = makeMockJobPrisma(baseJobRecord);
    const generate = vi.fn().mockRejectedValue(new Error('OpenAI timeout'));

    await executeReviewJob(jobId, {
      prisma: prisma.client,
      generate,
    });

    expect(prisma.update).toHaveBeenCalledTimes(2);
    const failCall = prisma.update.mock.calls[1][0];
    expect(failCall.data.status).toBe('FAILED');
    // Must NOT leak the raw error message.
    expect(failCall.data.errorMessage).toBe('Generation failed');
    expect(failCall.data.errorMessage).not.toContain('OpenAI');
  });

  it('marks job FAILED with moderation categories when ModerationError is thrown', async () => {
    const prisma = makeMockJobPrisma(baseJobRecord);
    const modErr = new ModerationError({
      reason: 'Flagged by moderation service',
      categories: ['harassment', 'violence'],
    });
    const generate = vi.fn().mockRejectedValue(modErr);

    await executeReviewJob(jobId, {
      prisma: prisma.client,
      generate,
    });

    const failCall = prisma.update.mock.calls[1][0];
    expect(failCall.data.status).toBe('FAILED');
    expect(failCall.data.errorMessage).toBe('Moderation failed: harassment, violence');
  });
});

/**
 * Background worker for review-response generation jobs.
 *
 * Reads the job from the database, runs the existing generation +
 * moderation pipeline, and updates the job record to COMPLETED or FAILED.
 *
 * All external dependencies are injectable via `deps` for testing.
 */

import { prisma as defaultPrisma } from './prisma.js';
import { generateAndStoreReviewResponse } from './reviewResponses.js';

export async function executeReviewJob(jobId, deps = {}) {
  const prisma = deps.prisma ?? defaultPrisma;
  const generate = deps.generate ?? generateAndStoreReviewResponse;

  // Mark PROCESSING
  const job = await prisma.reviewJob.update({
    where: { id: jobId },
    data: { status: 'PROCESSING' },
  });

  try {
    // Run the full pipeline (OpenAI → moderation → DB upsert).
    // Forward deps so tests can inject mocks all the way down.
    const saved = await generate(job.inputPayload, deps);

    await prisma.reviewJob.update({
      where: { id: jobId },
      data: { status: 'COMPLETED', responseId: saved.id },
    });
  } catch (err) {
    // Sanitize — never leak raw stack traces or API keys.
    const safeMessage =
      err?.name === 'ModerationError'
        ? `Moderation failed: ${(err.categories ?? []).join(', ')}`
        : 'Generation failed';

    await prisma.reviewJob.update({
      where: { id: jobId },
      data: { status: 'FAILED', errorMessage: safeMessage },
    });
  }
}

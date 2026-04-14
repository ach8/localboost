/**
 * Deletes terminal-state ReviewJob rows older than a cutoff.
 *
 * "Terminal" = COMPLETED or FAILED. PENDING and PROCESSING rows are
 * never touched here — removing an in-flight job would orphan the
 * worker and break status polling.
 *
 * Exported as a pure function with an injectable Prisma client so
 * the route handler stays thin and the logic is unit-testable.
 */

import { prisma as defaultPrisma } from './prisma.js';
import {
  DEFAULT_RETENTION_DAYS,
  MIN_RETENTION_DAYS,
  MAX_RETENTION_DAYS,
  TERMINAL_STATUSES,
} from './reviewJobCleanup.constants.js';

// Re-export so server-side callers keep a single import site.
export { DEFAULT_RETENTION_DAYS, MIN_RETENTION_DAYS, MAX_RETENTION_DAYS, TERMINAL_STATUSES };

/**
 * @param {object} [options]
 * @param {number} [options.olderThanDays=30]
 * @param {object} [options.prisma] — injectable for tests
 * @param {() => Date} [options.now] — injectable clock for tests
 * @returns {Promise<{ deletedCount: number, cutoff: string, olderThanDays: number }>}
 */
export async function cleanupReviewJobs({
  olderThanDays = DEFAULT_RETENTION_DAYS,
  prisma = defaultPrisma,
  now = () => new Date(),
} = {}) {
  if (
    !Number.isFinite(olderThanDays) ||
    olderThanDays < MIN_RETENTION_DAYS ||
    olderThanDays > MAX_RETENTION_DAYS
  ) {
    throw new RangeError(
      `olderThanDays must be a number between ${MIN_RETENTION_DAYS} and ${MAX_RETENTION_DAYS}`,
    );
  }

  const cutoff = new Date(now().getTime() - olderThanDays * 24 * 60 * 60 * 1000);

  // Filter on updatedAt: a job's last state transition is what determines
  // whether it's "stale". A job created long ago but completed recently
  // is still fresh signal to operators reviewing recent failures.
  const result = await prisma.reviewJob.deleteMany({
    where: {
      status: { in: [...TERMINAL_STATUSES] },
      updatedAt: { lt: cutoff },
    },
  });

  return {
    deletedCount: result.count,
    cutoff: cutoff.toISOString(),
    olderThanDays,
  };
}

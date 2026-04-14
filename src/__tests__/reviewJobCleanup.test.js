import { describe, it, expect, vi } from 'vitest';
import {
  cleanupReviewJobs,
  DEFAULT_RETENTION_DAYS,
  MIN_RETENTION_DAYS,
  MAX_RETENTION_DAYS,
  TERMINAL_STATUSES,
} from '@/lib/reviewJobCleanup';

function makeMockPrisma(count = 0) {
  const deleteMany = vi.fn().mockResolvedValue({ count });
  return { client: { reviewJob: { deleteMany } }, deleteMany };
}

describe('cleanupReviewJobs', () => {
  const FIXED_NOW = new Date('2026-04-13T12:00:00.000Z');
  const now = () => FIXED_NOW;

  it('deletes COMPLETED and FAILED jobs older than the default retention window', async () => {
    const prisma = makeMockPrisma(7);

    const result = await cleanupReviewJobs({ prisma: prisma.client, now });

    expect(prisma.deleteMany).toHaveBeenCalledTimes(1);
    const arg = prisma.deleteMany.mock.calls[0][0];
    expect(arg.where.status).toEqual({ in: ['COMPLETED', 'FAILED'] });
    expect(arg.where.updatedAt.lt).toBeInstanceOf(Date);

    const expectedCutoff = new Date(FIXED_NOW.getTime() - DEFAULT_RETENTION_DAYS * 86_400_000);
    expect(arg.where.updatedAt.lt.toISOString()).toBe(expectedCutoff.toISOString());

    expect(result).toEqual({
      deletedCount: 7,
      cutoff: expectedCutoff.toISOString(),
      olderThanDays: DEFAULT_RETENTION_DAYS,
    });
  });

  it('honors a custom olderThanDays value', async () => {
    const prisma = makeMockPrisma(3);

    const result = await cleanupReviewJobs({
      prisma: prisma.client,
      now,
      olderThanDays: 7,
    });

    const expectedCutoff = new Date(FIXED_NOW.getTime() - 7 * 86_400_000);
    expect(prisma.deleteMany.mock.calls[0][0].where.updatedAt.lt.toISOString()).toBe(
      expectedCutoff.toISOString(),
    );
    expect(result.olderThanDays).toBe(7);
    expect(result.deletedCount).toBe(3);
  });

  it('returns zero deletedCount when nothing matches', async () => {
    const prisma = makeMockPrisma(0);

    const result = await cleanupReviewJobs({ prisma: prisma.client, now });

    expect(result.deletedCount).toBe(0);
  });

  it('never targets PENDING or PROCESSING jobs', async () => {
    const prisma = makeMockPrisma(0);
    await cleanupReviewJobs({ prisma: prisma.client, now });

    const statuses = prisma.deleteMany.mock.calls[0][0].where.status.in;
    expect(statuses).not.toContain('PENDING');
    expect(statuses).not.toContain('PROCESSING');
    expect(TERMINAL_STATUSES).toEqual(['COMPLETED', 'FAILED']);
  });

  it.each([
    ['zero', 0],
    ['negative', -1],
    ['too large', MAX_RETENTION_DAYS + 1],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
  ])('rejects invalid olderThanDays: %s', async (_label, value) => {
    const prisma = makeMockPrisma(0);
    await expect(
      cleanupReviewJobs({ prisma: prisma.client, now, olderThanDays: value }),
    ).rejects.toBeInstanceOf(RangeError);
    expect(prisma.deleteMany).not.toHaveBeenCalled();
  });

  it('accepts boundary values', async () => {
    const prisma = makeMockPrisma(0);
    await expect(
      cleanupReviewJobs({ prisma: prisma.client, now, olderThanDays: MIN_RETENTION_DAYS }),
    ).resolves.toBeDefined();
    await expect(
      cleanupReviewJobs({ prisma: prisma.client, now, olderThanDays: MAX_RETENTION_DAYS }),
    ).resolves.toBeDefined();
  });
});

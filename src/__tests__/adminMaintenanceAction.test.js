import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Prisma layer — mocked so the action doesn't talk to a real DB.
vi.mock('@/lib/reviewJobCleanup', async () => {
  const actual = await vi.importActual('@/lib/reviewJobCleanup');
  return {
    ...actual,
    cleanupReviewJobs: vi.fn(),
  };
});

// Cookie store for simulating signed-in / signed-out browsers.
const cookieStore = { get: vi.fn() };
vi.mock('next/headers', () => ({ cookies: () => cookieStore }));

import { runReviewJobCleanup } from '@/app/admin/maintenance/actions';
import { cleanupReviewJobs } from '@/lib/reviewJobCleanup';
import { ADMIN_SESSION_COOKIE, createAdminSessionValue } from '@/lib/adminSession';

const TOKEN = 'y'.repeat(40);
const OTHER_TOKEN = 'z'.repeat(40);

function setCookie(value) {
  cookieStore.get.mockImplementation((name) =>
    name === ADMIN_SESSION_COOKIE && value !== undefined ? { name, value } : undefined,
  );
}

function clearCookie() {
  cookieStore.get.mockImplementation(() => undefined);
}

describe('runReviewJobCleanup (server action)', () => {
  const originalToken = process.env.ADMIN_API_TOKEN;

  beforeEach(() => {
    process.env.ADMIN_API_TOKEN = TOKEN;
    vi.mocked(cleanupReviewJobs).mockReset();
    cookieStore.get.mockReset();
    clearCookie();
  });

  afterEach(() => {
    if (originalToken === undefined) delete process.env.ADMIN_API_TOKEN;
    else process.env.ADMIN_API_TOKEN = originalToken;
  });

  describe('authentication gate (must run BEFORE input validation)', () => {
    it('rejects unauthenticated callers without touching Prisma', async () => {
      clearCookie();
      const result = await runReviewJobCleanup({ olderThanDays: 30 });
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/unauthorized/i);
      expect(cleanupReviewJobs).not.toHaveBeenCalled();
    });

    it('rejects callers with a garbage cookie', async () => {
      setCookie('this.is.not.a.real.session');
      const result = await runReviewJobCleanup({ olderThanDays: 30 });
      expect(result.ok).toBe(false);
      expect(cleanupReviewJobs).not.toHaveBeenCalled();
    });

    it('rejects a session cookie signed with a DIFFERENT admin token', async () => {
      process.env.ADMIN_API_TOKEN = OTHER_TOKEN;
      const forged = createAdminSessionValue();
      process.env.ADMIN_API_TOKEN = TOKEN;

      setCookie(forged);
      const result = await runReviewJobCleanup({ olderThanDays: 30 });
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/unauthorized/i);
      expect(cleanupReviewJobs).not.toHaveBeenCalled();
    });

    it('rejects an expired session with a distinct message', async () => {
      const expired = createAdminSessionValue({
        now: () => 1_000_000_000_000,
        ttlSeconds: 1,
      });
      // Travel far past expiry by rewriting Date.now.
      const originalNow = Date.now;
      Date.now = () => 2_000_000_000_000;
      setCookie(expired);

      try {
        const result = await runReviewJobCleanup({ olderThanDays: 30 });
        expect(result.ok).toBe(false);
        expect(result.error).toMatch(/expired/i);
      } finally {
        Date.now = originalNow;
      }
      expect(cleanupReviewJobs).not.toHaveBeenCalled();
    });

    it('auth check runs BEFORE input validation (invalid input + no auth → unauthorized, not a days error)', async () => {
      clearCookie();
      const result = await runReviewJobCleanup({ olderThanDays: -999 });
      expect(result.error).toMatch(/unauthorized/i);
      expect(result.error).not.toMatch(/olderThanDays/i);
    });

    it('surfaces a server-configuration error if ADMIN_API_TOKEN is unset', async () => {
      delete process.env.ADMIN_API_TOKEN;
      setCookie('anything');
      const result = await runReviewJobCleanup({ olderThanDays: 30 });
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/not configured/i);
      expect(cleanupReviewJobs).not.toHaveBeenCalled();
    });
  });

  describe('with a valid admin session', () => {
    beforeEach(() => {
      setCookie(createAdminSessionValue());
    });

    it('returns ok with data when cleanup succeeds', async () => {
      vi.mocked(cleanupReviewJobs).mockResolvedValue({
        deletedCount: 3,
        cutoff: '2026-03-14T12:00:00.000Z',
        olderThanDays: 30,
      });

      const result = await runReviewJobCleanup({ olderThanDays: 30 });

      expect(result).toEqual({
        ok: true,
        data: {
          deletedCount: 3,
          cutoff: '2026-03-14T12:00:00.000Z',
          olderThanDays: 30,
        },
      });
      expect(cleanupReviewJobs).toHaveBeenCalledWith({ olderThanDays: 30 });
    });

    it.each([
      ['missing', undefined],
      ['zero', 0],
      ['negative', -5],
      ['non-integer', 1.5],
      ['too large', 10_000],
      ['NaN', Number.NaN],
    ])('rejects invalid olderThanDays: %s', async (_label, value) => {
      const result = await runReviewJobCleanup(value === undefined ? {} : { olderThanDays: value });
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/olderThanDays/i);
      expect(cleanupReviewJobs).not.toHaveBeenCalled();
    });

    it('forwards RangeError messages from the cleanup layer', async () => {
      vi.mocked(cleanupReviewJobs).mockRejectedValue(new RangeError('specific bounds message'));
      const result = await runReviewJobCleanup({ olderThanDays: 30 });
      expect(result).toEqual({ ok: false, error: 'specific bounds message' });
    });

    it('returns a generic error (no internal details leaked) on unexpected throw', async () => {
      vi.mocked(cleanupReviewJobs).mockRejectedValue(new Error('db connection lost: host=prod-1'));
      const result = await runReviewJobCleanup({ olderThanDays: 30 });
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Failed to clean up review jobs');
      expect(result.error).not.toMatch(/db connection/);
    });
  });
});

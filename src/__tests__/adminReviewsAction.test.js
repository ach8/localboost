import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Prisma — mocked so the action never touches a real DB.
vi.mock('@/lib/prisma', () => ({
  prisma: { googleReview: { deleteMany: vi.fn() } },
}));

// revalidatePath — assert it fires only after a successful, authenticated delete.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

// Cookie store for simulating signed-in / signed-out browsers. The factory
// closes over `cookieStore` lazily (via the arrow body), so hoisting is safe.
const cookieStore = { get: vi.fn() };
vi.mock('next/headers', () => ({ cookies: () => cookieStore }));

import { deleteReview } from '@/app/admin/reviews/actions';
import { ADMIN_SESSION_COOKIE, createAdminSessionValue } from '@/lib/adminSession';
import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

const deleteMany = vi.mocked(prisma.googleReview.deleteMany);

const TOKEN = 'r'.repeat(40);
const OTHER_TOKEN = 's'.repeat(40);

function setCookie(value) {
  cookieStore.get.mockImplementation((name) =>
    name === ADMIN_SESSION_COOKIE && value !== undefined ? { name, value } : undefined,
  );
}
function clearCookie() {
  cookieStore.get.mockImplementation(() => undefined);
}

describe('deleteReview (server action)', () => {
  const originalToken = process.env.ADMIN_API_TOKEN;

  beforeEach(() => {
    process.env.ADMIN_API_TOKEN = TOKEN;
    deleteMany.mockReset().mockResolvedValue({ count: 1 });
    vi.mocked(revalidatePath).mockReset();
    cookieStore.get.mockReset();
    clearCookie();
  });

  afterEach(() => {
    if (originalToken === undefined) delete process.env.ADMIN_API_TOKEN;
    else process.env.ADMIN_API_TOKEN = originalToken;
  });

  describe('authentication gate (must run BEFORE input validation and BEFORE Prisma)', () => {
    it('rejects callers with no session cookie', async () => {
      const result = await deleteReview({ reviewId: 'rev_1' });
      expect(result).toEqual({ ok: false, error: expect.stringMatching(/unauthorized/i) });
      expect(deleteMany).not.toHaveBeenCalled();
      expect(revalidatePath).not.toHaveBeenCalled();
    });

    it('rejects a session signed with a DIFFERENT admin token', async () => {
      process.env.ADMIN_API_TOKEN = OTHER_TOKEN;
      const forged = createAdminSessionValue();
      process.env.ADMIN_API_TOKEN = TOKEN;
      setCookie(forged);

      const result = await deleteReview({ reviewId: 'rev_1' });
      expect(result.ok).toBe(false);
      expect(deleteMany).not.toHaveBeenCalled();
    });

    it('rejects an expired session with a distinct message', async () => {
      const expired = createAdminSessionValue({ now: () => 1_000_000_000_000, ttlSeconds: 1 });
      const realNow = Date.now;
      Date.now = () => 2_000_000_000_000;
      setCookie(expired);
      try {
        const result = await deleteReview({ reviewId: 'rev_1' });
        expect(result.error).toMatch(/expired/i);
      } finally {
        Date.now = realNow;
      }
      expect(deleteMany).not.toHaveBeenCalled();
    });

    it('runs auth BEFORE input validation (no cookie + bad input → unauthorized, not a reviewId error)', async () => {
      const result = await deleteReview({ reviewId: '' });
      expect(result.error).toMatch(/unauthorized/i);
      expect(result.error).not.toMatch(/reviewId/i);
    });

    it('surfaces a server-configuration error if ADMIN_API_TOKEN is unset', async () => {
      delete process.env.ADMIN_API_TOKEN;
      setCookie('anything');
      const result = await deleteReview({ reviewId: 'rev_1' });
      expect(result.error).toMatch(/not configured/i);
      expect(deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('with a valid admin session', () => {
    beforeEach(() => {
      setCookie(createAdminSessionValue());
    });

    it('deletes the row and revalidates the dashboard', async () => {
      const result = await deleteReview({ reviewId: 'rev_abc' });

      expect(deleteMany).toHaveBeenCalledTimes(1);
      expect(deleteMany).toHaveBeenCalledWith({ where: { id: 'rev_abc' } });
      expect(revalidatePath).toHaveBeenCalledWith('/admin/reviews');
      expect(result).toEqual({ ok: true, deleted: true });
    });

    it('is idempotent — missing row resolves ok with deleted:false', async () => {
      deleteMany.mockResolvedValue({ count: 0 });
      const result = await deleteReview({ reviewId: 'gone' });
      expect(result).toEqual({ ok: true, deleted: false });
    });

    it.each([
      ['missing', undefined],
      ['empty string', ''],
      ['whitespace', '   '],
      ['non-string', 123],
      ['too long', 'x'.repeat(500)],
    ])('rejects invalid reviewId: %s', async (_label, value) => {
      const result = await deleteReview(value === undefined ? {} : { reviewId: value });
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/reviewId/i);
      expect(deleteMany).not.toHaveBeenCalled();
      expect(revalidatePath).not.toHaveBeenCalled();
    });

    it('returns a generic error (no internal details leaked) on Prisma failure', async () => {
      deleteMany.mockRejectedValue(new Error('connection refused: host=prod-db-1'));
      const result = await deleteReview({ reviewId: 'rev_1' });
      expect(result).toEqual({ ok: false, error: 'Failed to delete review.' });
      expect(result.error).not.toMatch(/prod-db-1/);
      expect(revalidatePath).not.toHaveBeenCalled();
    });
  });
});

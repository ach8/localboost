import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Prisma — mocked so the action never touches a real DB.
vi.mock('@/lib/prisma', () => ({
  prisma: {
    googleReview: { deleteMany: vi.fn(), findUnique: vi.fn() },
    reviewResponse: { update: vi.fn() },
  },
}));

// revalidatePath — assert it fires only after a successful, authenticated mutation.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

// Generation pipeline — mocked so OpenAI and moderation are never invoked.
vi.mock('@/lib/reviewResponses', () => ({
  generateAndStoreReviewResponse: vi.fn(),
}));

// Cookie store for simulating signed-in / signed-out browsers. The factory
// closes over `cookieStore` lazily (via the arrow body), so hoisting is safe.
const cookieStore = { get: vi.fn() };
vi.mock('next/headers', () => ({ cookies: () => cookieStore }));

import {
  approveReviewResponse,
  deleteReview,
  regenerateReviewResponse,
} from '@/app/admin/reviews/actions';
import { ADMIN_SESSION_COOKIE, createAdminSessionValue } from '@/lib/adminSession';
import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { generateAndStoreReviewResponse } from '@/lib/reviewResponses';

const deleteMany = vi.mocked(prisma.googleReview.deleteMany);
const findUnique = vi.mocked(prisma.googleReview.findUnique);
const responseUpdate = vi.mocked(prisma.reviewResponse.update);
const generate = vi.mocked(generateAndStoreReviewResponse);

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

describe('approveReviewResponse (server action)', () => {
  const originalToken = process.env.ADMIN_API_TOKEN;

  beforeEach(() => {
    process.env.ADMIN_API_TOKEN = TOKEN;
    responseUpdate.mockReset();
    vi.mocked(revalidatePath).mockReset();
    cookieStore.get.mockReset();
    clearCookie();
  });

  afterEach(() => {
    if (originalToken === undefined) delete process.env.ADMIN_API_TOKEN;
    else process.env.ADMIN_API_TOKEN = originalToken;
  });

  it('rejects unauthenticated callers before touching Prisma', async () => {
    const result = await approveReviewResponse({ responseId: 'resp_1' });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/unauthorized/i);
    expect(responseUpdate).not.toHaveBeenCalled();
  });

  it('runs auth BEFORE input validation', async () => {
    const result = await approveReviewResponse({ responseId: '' });
    expect(result.error).toMatch(/unauthorized/i);
    expect(result.error).not.toMatch(/responseId/i);
  });

  describe('with a valid admin session', () => {
    beforeEach(() => setCookie(createAdminSessionValue()));

    it.each([
      ['missing', undefined],
      ['empty string', ''],
      ['whitespace', '   '],
      ['non-string', 7],
    ])('rejects invalid responseId: %s', async (_label, value) => {
      const result = await approveReviewResponse(value === undefined ? {} : { responseId: value });
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/responseId/i);
      expect(responseUpdate).not.toHaveBeenCalled();
    });

    it('updates status to APPROVED and revalidates', async () => {
      responseUpdate.mockResolvedValue({ id: 'resp_1', status: 'APPROVED' });
      const result = await approveReviewResponse({ responseId: 'resp_1' });

      expect(responseUpdate).toHaveBeenCalledWith({
        where: { id: 'resp_1' },
        data: { status: 'APPROVED' },
        select: { id: true, status: true },
      });
      expect(revalidatePath).toHaveBeenCalledWith('/admin/reviews');
      expect(result).toEqual({ ok: true, response: { id: 'resp_1', status: 'APPROVED' } });
    });

    it('returns a friendly error when the row is already gone (P2025)', async () => {
      const err = Object.assign(new Error('Record not found'), { code: 'P2025' });
      responseUpdate.mockRejectedValue(err);
      const result = await approveReviewResponse({ responseId: 'missing' });
      expect(result).toEqual({ ok: false, error: 'Response no longer exists.' });
      expect(revalidatePath).not.toHaveBeenCalled();
    });

    it('returns a generic error (no internal details leaked) on Prisma failure', async () => {
      responseUpdate.mockRejectedValue(new Error('connection refused: host=prod-db-7'));
      const result = await approveReviewResponse({ responseId: 'resp_1' });
      expect(result).toEqual({ ok: false, error: 'Failed to approve response.' });
      expect(result.error).not.toMatch(/prod-db-7/);
    });
  });
});

describe('regenerateReviewResponse (server action)', () => {
  const originalToken = process.env.ADMIN_API_TOKEN;

  beforeEach(() => {
    process.env.ADMIN_API_TOKEN = TOKEN;
    findUnique.mockReset();
    generate.mockReset();
    vi.mocked(revalidatePath).mockReset();
    cookieStore.get.mockReset();
    clearCookie();
  });

  afterEach(() => {
    if (originalToken === undefined) delete process.env.ADMIN_API_TOKEN;
    else process.env.ADMIN_API_TOKEN = originalToken;
  });

  it('rejects unauthenticated callers before touching Prisma or the generator', async () => {
    const result = await regenerateReviewResponse({ reviewId: 'rev_1' });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/unauthorized/i);
    expect(findUnique).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });

  describe('with a valid admin session', () => {
    beforeEach(() => setCookie(createAdminSessionValue()));

    it.each([
      ['missing', undefined],
      ['empty string', ''],
      ['non-string', 42],
    ])('rejects invalid reviewId: %s', async (_label, value) => {
      const result = await regenerateReviewResponse(value === undefined ? {} : { reviewId: value });
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/reviewId/i);
      expect(findUnique).not.toHaveBeenCalled();
      expect(generate).not.toHaveBeenCalled();
    });

    it('returns a friendly error when the review no longer exists', async () => {
      findUnique.mockResolvedValue(null);
      const result = await regenerateReviewResponse({ reviewId: 'gone' });
      expect(result).toEqual({ ok: false, error: 'Review no longer exists.' });
      expect(generate).not.toHaveBeenCalled();
      expect(revalidatePath).not.toHaveBeenCalled();
    });

    it('runs the generation pipeline with the current review data and revalidates', async () => {
      findUnique.mockResolvedValue({
        id: 'rev_1',
        rating: 4,
        comment: 'Loved it',
        reviewerName: 'Alice',
        business: { name: 'Joe’s Pizza' },
      });
      generate.mockResolvedValue({
        id: 'resp_new',
        content: 'Thanks Alice!',
        status: 'DRAFT',
        updatedAt: new Date('2026-04-15T00:00:00.000Z'),
      });

      const result = await regenerateReviewResponse({ reviewId: 'rev_1' });

      expect(findUnique).toHaveBeenCalledWith({
        where: { id: 'rev_1' },
        include: { business: { select: { name: true } } },
      });
      expect(generate).toHaveBeenCalledWith({
        reviewId: 'rev_1',
        businessName: 'Joe’s Pizza',
        rating: 4,
        comment: 'Loved it',
        reviewerName: 'Alice',
      });
      expect(revalidatePath).toHaveBeenCalledWith('/admin/reviews');
      expect(result.ok).toBe(true);
      expect(result.response).toMatchObject({
        id: 'resp_new',
        content: 'Thanks Alice!',
        status: 'DRAFT',
      });
    });

    it('coerces nullable review fields to generator-friendly defaults', async () => {
      findUnique.mockResolvedValue({
        id: 'rev_2',
        rating: 1,
        comment: null,
        reviewerName: null,
        business: { name: 'Cafe A' },
      });
      generate.mockResolvedValue({
        id: 'resp_2',
        content: '…',
        status: 'DRAFT',
        updatedAt: new Date(),
      });
      await regenerateReviewResponse({ reviewId: 'rev_2' });
      expect(generate).toHaveBeenCalledWith({
        reviewId: 'rev_2',
        businessName: 'Cafe A',
        rating: 1,
        comment: '',
        reviewerName: undefined,
      });
    });

    it('surfaces a moderation failure as a dedicated error without leaking internals', async () => {
      findUnique.mockResolvedValue({
        id: 'rev_3',
        rating: 3,
        comment: 'ok',
        reviewerName: null,
        business: { name: 'B' },
      });
      const modErr = Object.assign(new Error('flagged'), {
        name: 'ModerationError',
        categories: ['violence'],
      });
      generate.mockRejectedValue(modErr);
      const result = await regenerateReviewResponse({ reviewId: 'rev_3' });
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/moderation/i);
      expect(revalidatePath).not.toHaveBeenCalled();
    });

    it('returns a generic error (no internal details) when the generator throws', async () => {
      findUnique.mockResolvedValue({
        id: 'rev_4',
        rating: 5,
        comment: 'x',
        reviewerName: null,
        business: { name: 'B' },
      });
      generate.mockRejectedValue(new Error('OpenAI 500: api key sk-xxxx'));
      const result = await regenerateReviewResponse({ reviewId: 'rev_4' });
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Failed to regenerate response.');
      expect(result.error).not.toMatch(/sk-xxxx/);
    });

    it('rejects a review that is missing business metadata', async () => {
      findUnique.mockResolvedValue({
        id: 'rev_5',
        rating: 5,
        comment: 'x',
        reviewerName: null,
        business: null,
      });
      const result = await regenerateReviewResponse({ reviewId: 'rev_5' });
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/business/i);
      expect(generate).not.toHaveBeenCalled();
    });
  });
});

import { describe, it, expect, vi } from 'vitest';
import { buildReviewWhere, buildReviewOrderBy, listReviews } from '@/lib/reviewQuery';
import { parseReviewSearchParams } from '@/app/admin/reviews/searchParams';

describe('buildReviewWhere', () => {
  it('is empty when no filters are applied', () => {
    expect(buildReviewWhere({})).toEqual({});
  });

  it('scopes by businessId when provided', () => {
    expect(buildReviewWhere({ businessId: 'biz_1' })).toEqual({ businessId: 'biz_1' });
  });

  it('applies an exact-match star-rating filter', () => {
    expect(buildReviewWhere({ rating: 3 })).toEqual({ rating: 3 });
  });

  it('ignores out-of-range or non-integer ratings', () => {
    expect(buildReviewWhere({ rating: 0 })).toEqual({});
    expect(buildReviewWhere({ rating: 6 })).toEqual({});
    expect(buildReviewWhere({ rating: 2.5 })).toEqual({});
  });

  it('applies the source filter', () => {
    expect(buildReviewWhere({ source: 'DIRECT' })).toEqual({ source: 'DIRECT' });
  });

  describe('date-range filter (postedAt)', () => {
    it('applies a lower bound at UTC start-of-day', () => {
      expect(buildReviewWhere({ from: '2026-03-01' })).toEqual({
        postedAt: { gte: new Date('2026-03-01T00:00:00.000Z') },
      });
    });

    it('applies an upper bound inclusive of the entire UTC day', () => {
      expect(buildReviewWhere({ to: '2026-03-31' })).toEqual({
        postedAt: { lte: new Date('2026-03-31T23:59:59.999Z') },
      });
    });

    it('combines both bounds', () => {
      expect(buildReviewWhere({ from: '2026-03-01', to: '2026-03-31' })).toEqual({
        postedAt: {
          gte: new Date('2026-03-01T00:00:00.000Z'),
          lte: new Date('2026-03-31T23:59:59.999Z'),
        },
      });
    });

    it('ignores unparseable dates (defence in depth — parser already guards this)', () => {
      expect(buildReviewWhere({ from: 'not-a-date' })).toEqual({});
    });
  });

  it('builds a case-insensitive OR over comment + reviewerName for q', () => {
    expect(buildReviewWhere({ q: '  pizza ' })).toEqual({
      OR: [
        { comment: { contains: 'pizza', mode: 'insensitive' } },
        { reviewerName: { contains: 'pizza', mode: 'insensitive' } },
      ],
    });
  });

  it('combines all filters', () => {
    expect(
      buildReviewWhere({
        businessId: 'b',
        rating: 5,
        source: 'GOOGLE',
        from: '2026-01-01',
        to: '2026-01-31',
        q: 'nice',
      }),
    ).toEqual({
      businessId: 'b',
      rating: 5,
      source: 'GOOGLE',
      postedAt: {
        gte: new Date('2026-01-01T00:00:00.000Z'),
        lte: new Date('2026-01-31T23:59:59.999Z'),
      },
      OR: [
        { comment: { contains: 'nice', mode: 'insensitive' } },
        { reviewerName: { contains: 'nice', mode: 'insensitive' } },
      ],
    });
  });
});

describe('buildReviewOrderBy', () => {
  it('defaults to postedAt desc with id as the stable tiebreak', () => {
    expect(buildReviewOrderBy({})).toEqual([{ postedAt: 'desc' }, { id: 'desc' }]);
  });

  it('honours an allowed sort field and direction', () => {
    expect(buildReviewOrderBy({ sort: 'rating', order: 'asc' })).toEqual([
      { rating: 'asc' },
      { id: 'asc' },
    ]);
  });

  it('falls back when given an unknown column (defence in depth — parser already guards this)', () => {
    expect(buildReviewOrderBy({ sort: 'dropTable', order: 'asc' })).toEqual([
      { postedAt: 'asc' },
      { id: 'asc' },
    ]);
  });
});

describe('listReviews', () => {
  function fakePrisma({ total, rows }) {
    return {
      googleReview: {
        count: vi.fn().mockResolvedValue(total),
        findMany: vi.fn().mockResolvedValue(rows),
      },
    };
  }

  it('translates parsed search params into the correct Prisma call', async () => {
    const prisma = fakePrisma({ total: 42, rows: [{ id: 'r1' }] });
    const state = parseReviewSearchParams({
      page: '2',
      pageSize: '10',
      rating: '5',
      sort: 'rating',
    });

    const result = await listReviews(state, { prisma, businessId: 'biz_1' });

    expect(prisma.googleReview.count).toHaveBeenCalledWith({
      where: { businessId: 'biz_1', rating: 5 },
    });
    expect(prisma.googleReview.findMany).toHaveBeenCalledWith({
      where: { businessId: 'biz_1', rating: 5 },
      orderBy: [{ rating: 'desc' }, { id: 'desc' }],
      skip: 10,
      take: 10,
      include: {
        business: { select: { id: true, name: true } },
        response: { select: { id: true, status: true } },
      },
    });

    expect(result).toEqual({
      items: [{ id: 'r1' }],
      total: 42,
      page: 2,
      pageSize: 10,
      pageCount: 5,
    });
  });

  it('clamps the reported page when it exceeds the available page count', async () => {
    const prisma = fakePrisma({ total: 3, rows: [] });
    const state = parseReviewSearchParams({ page: '99', pageSize: '10' });
    const result = await listReviews(state, { prisma });
    expect(result.pageCount).toBe(1);
    expect(result.page).toBe(1);
  });

  it('never asks Prisma for more than MAX_PAGE_SIZE rows', async () => {
    const prisma = fakePrisma({ total: 0, rows: [] });
    // Bypass the parser to simulate a hostile caller of the lib function.
    await listReviews({ page: 1, pageSize: 100_000, sort: 'postedAt', order: 'desc' }, { prisma });
    expect(prisma.googleReview.findMany.mock.calls[0][0].take).toBe(100);
  });
});

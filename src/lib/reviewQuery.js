/**
 * Read-side data access for the Review Management Dashboard.
 *
 * Converts a parsed search-param state (see
 * `src/app/admin/reviews/searchParams.js`) into a Prisma `findMany` +
 * `count` pair and returns a page of reviews plus paging metadata.
 *
 * The Prisma client is injectable so the function is unit-testable
 * without a live database, mirroring `reviewJobCleanup.js`.
 */

import { prisma as defaultPrisma } from './prisma.js';
import { REVIEW_SORT_FIELDS, MAX_PAGE_SIZE } from '@/app/admin/reviews/searchParams';

// `from`/`to` arrive as calendar dates (YYYY-MM-DD). Interpret them in UTC
// so the same shared URL selects the same rows regardless of the server's
// local timezone. `to` is inclusive of the entire day.
function startOfUtcDay(iso) {
  const ms = Date.parse(`${iso}T00:00:00.000Z`);
  return Number.isFinite(ms) ? new Date(ms) : null;
}

function endOfUtcDay(iso) {
  const ms = Date.parse(`${iso}T23:59:59.999Z`);
  return Number.isFinite(ms) ? new Date(ms) : null;
}

/**
 * Build the Prisma `where` clause for a given filter state. Exported
 * separately so tests can assert on the shape without invoking Prisma.
 */
export function buildReviewWhere({ rating, source, from, to, q, businessId } = {}) {
  const where = {};

  if (businessId) where.businessId = businessId;
  if (Number.isInteger(rating) && rating >= 1 && rating <= 5) where.rating = rating;
  if (source) where.source = source;

  const gte = from ? startOfUtcDay(from) : null;
  const lte = to ? endOfUtcDay(to) : null;
  if (gte || lte) {
    where.postedAt = {};
    if (gte) where.postedAt.gte = gte;
    if (lte) where.postedAt.lte = lte;
  }

  if (typeof q === 'string' && q.trim().length > 0) {
    const term = q.trim();
    where.OR = [
      { comment: { contains: term, mode: 'insensitive' } },
      { reviewerName: { contains: term, mode: 'insensitive' } },
    ];
  }

  return where;
}

export function buildReviewOrderBy({ sort, order } = {}) {
  const field = REVIEW_SORT_FIELDS.includes(sort) ? sort : 'postedAt';
  const direction = order === 'asc' ? 'asc' : 'desc';
  // Secondary key keeps paging stable when many rows share the same
  // primary sort value (e.g. dozens of 5-star reviews on one day).
  return [{ [field]: direction }, { id: direction }];
}

/**
 * @param {ReturnType<import('@/app/admin/reviews/searchParams').parseReviewSearchParams>} state
 * @param {{ prisma?: object, businessId?: string }} [deps]
 */
export async function listReviews(state, { prisma = defaultPrisma, businessId } = {}) {
  const pageSize = Math.min(Math.max(state.pageSize, 1), MAX_PAGE_SIZE);
  const page = Math.max(state.page, 1);
  const where = buildReviewWhere({ ...state, businessId });
  const orderBy = buildReviewOrderBy(state);

  const [total, items] = await Promise.all([
    prisma.googleReview.count({ where }),
    prisma.googleReview.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        business: { select: { id: true, name: true } },
        response: { select: { id: true, status: true } },
      },
    }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return {
    items,
    total,
    page: Math.min(page, pageCount),
    pageSize,
    pageCount,
  };
}

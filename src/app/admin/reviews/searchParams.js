/**
 * URL ⇄ state contract for the Review Management Dashboard.
 *
 * The dashboard is fully URL-addressable: every filter, sort column, sort
 * direction, page index and page size lives in the query string so a view
 * can be bookmarked, shared, or opened in a new tab and render identically.
 *
 * `parseReviewSearchParams` is intentionally forgiving — unknown / malformed
 * values fall back to defaults rather than throwing, so a stale or
 * hand-edited link still loads a sensible view. `serializeReviewSearchParams`
 * is the inverse, omitting defaults to keep URLs short.
 *
 * Kept framework-free (no next/* imports) so it can run on the server
 * (page.js), the client (filter controls), and in Vitest unchanged.
 */

import { z } from 'zod';

export const REVIEW_SORT_FIELDS = Object.freeze(['postedAt', 'rating', 'createdAt']);
export const REVIEW_SORT_ORDERS = Object.freeze(['asc', 'desc']);
export const REVIEW_SOURCES = Object.freeze(['GOOGLE', 'DIRECT']);
// Response status filter. `NONE` is a synthetic value that selects reviews
// with no attached `ReviewResponse` row at all — useful for triaging brand-new
// reviews that haven't been run through the AI generator yet. The real
// `ResponseStatus` enum values (DRAFT / APPROVED / PUBLISHED / REJECTED) map
// 1:1 to prisma.ReviewResponse.status and select rows whose response currently
// sits in that state.
export const REVIEW_RESPONSE_STATUSES = Object.freeze([
  'DRAFT',
  'APPROVED',
  'PUBLISHED',
  'REJECTED',
  'NONE',
]);

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export const REVIEW_SEARCH_DEFAULTS = Object.freeze({
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
  sort: 'postedAt',
  order: 'desc',
  rating: null,
  source: null,
  responseStatus: null,
  // Date-range filter on `postedAt`. Stored as ISO calendar dates
  // (YYYY-MM-DD) so they survive a URL round-trip without timezone drift
  // and bind directly to <input type="date">.
  from: null,
  to: null,
  q: '',
});

// Next.js hands `searchParams` over as `Record<string, string | string[]>`.
// We only ever read the first value when an array is supplied.
const first = (v) => (Array.isArray(v) ? v[0] : v);

// Strict YYYY-MM-DD that also resolves to a real calendar day. JS Date
// silently rolls over (`2026-02-30` → Mar 2), so we round-trip through
// toISOString() and require an exact match to reject those.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const isoDateOrNull = z
  .preprocess((v) => {
    const s = first(v);
    if (typeof s !== 'string' || !ISO_DATE.test(s)) return undefined;
    const d = new Date(`${s}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return undefined;
    return d.toISOString().slice(0, 10) === s ? s : undefined;
  }, z.string().optional())
  .transform((s) => s ?? null);

const intInRange = (min, max, fallback) =>
  z
    .preprocess((v) => {
      const n = Number.parseInt(first(v), 10);
      return Number.isFinite(n) ? n : undefined;
    }, z.number().int().min(min).max(max).optional())
    .transform((n) => n ?? fallback);

const enumOrDefault = (values, fallback) =>
  z.preprocess((v) => first(v), z.enum(values).optional()).transform((v) => v ?? fallback);

const enumOrNull = (values) =>
  z.preprocess((v) => first(v), z.enum(values).optional()).transform((v) => v ?? null);

export const reviewSearchParamsSchema = z.object({
  page: intInRange(1, 100_000, REVIEW_SEARCH_DEFAULTS.page),
  pageSize: intInRange(1, MAX_PAGE_SIZE, REVIEW_SEARCH_DEFAULTS.pageSize),
  sort: enumOrDefault(REVIEW_SORT_FIELDS, REVIEW_SEARCH_DEFAULTS.sort),
  order: enumOrDefault(REVIEW_SORT_ORDERS, REVIEW_SEARCH_DEFAULTS.order),
  // Star-rating filter: 1..5, or null for "any".
  rating: z
    .preprocess((v) => {
      const n = Number.parseInt(first(v), 10);
      return Number.isFinite(n) ? n : undefined;
    }, z.number().int().min(1).max(5).optional())
    .transform((n) => n ?? null),
  source: enumOrNull(REVIEW_SOURCES),
  responseStatus: enumOrNull(REVIEW_RESPONSE_STATUSES),
  from: isoDateOrNull,
  to: isoDateOrNull,
  q: z
    .preprocess(
      (v) => (typeof first(v) === 'string' ? first(v) : undefined),
      z.string().max(200).optional(),
    )
    .transform((s) => (s ?? '').trim()),
});

/**
 * @param {Record<string, string | string[] | undefined> | undefined | null} raw
 * @returns {{ page: number, pageSize: number, sort: string, order: 'asc'|'desc', rating: number|null, source: string|null, q: string }}
 */
export function parseReviewSearchParams(raw) {
  // safeParse so a single bad key never 500s the page — every field has a
  // fallback baked into its preprocessor.
  const result = reviewSearchParamsSchema.safeParse(raw ?? {});
  if (result.success) return result.data;
  // Should be unreachable because every field is optional-with-default,
  // but fail closed to defaults rather than throwing.
  return { ...REVIEW_SEARCH_DEFAULTS };
}

/**
 * Serialize a (partial) state object back into a query string, omitting
 * any value that matches the default so shared URLs stay short.
 */
export function serializeReviewSearchParams(state) {
  const merged = { ...REVIEW_SEARCH_DEFAULTS, ...state };
  const params = new URLSearchParams();

  if (merged.page !== REVIEW_SEARCH_DEFAULTS.page) params.set('page', String(merged.page));
  if (merged.pageSize !== REVIEW_SEARCH_DEFAULTS.pageSize)
    params.set('pageSize', String(merged.pageSize));
  if (merged.sort !== REVIEW_SEARCH_DEFAULTS.sort) params.set('sort', merged.sort);
  if (merged.order !== REVIEW_SEARCH_DEFAULTS.order) params.set('order', merged.order);
  if (merged.rating != null) params.set('rating', String(merged.rating));
  if (merged.source != null) params.set('source', merged.source);
  if (merged.responseStatus != null) params.set('responseStatus', merged.responseStatus);
  if (merged.from != null) params.set('from', merged.from);
  if (merged.to != null) params.set('to', merged.to);
  if (merged.q) params.set('q', merged.q);

  return params.toString();
}

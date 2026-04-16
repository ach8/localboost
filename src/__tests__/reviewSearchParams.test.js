import { describe, it, expect } from 'vitest';
import {
  parseReviewSearchParams,
  serializeReviewSearchParams,
  REVIEW_SEARCH_DEFAULTS,
  MAX_PAGE_SIZE,
} from '@/app/admin/reviews/searchParams';

describe('parseReviewSearchParams', () => {
  it('returns defaults for an empty / missing query', () => {
    expect(parseReviewSearchParams(undefined)).toEqual(REVIEW_SEARCH_DEFAULTS);
    expect(parseReviewSearchParams({})).toEqual(REVIEW_SEARCH_DEFAULTS);
  });

  it('parses every supported key', () => {
    const parsed = parseReviewSearchParams({
      page: '3',
      pageSize: '50',
      sort: 'rating',
      order: 'asc',
      rating: '4',
      source: 'DIRECT',
      responseStatus: 'DRAFT',
      from: '2026-01-01',
      to: '2026-01-31',
      q: '  great service  ',
    });
    expect(parsed).toEqual({
      page: 3,
      pageSize: 50,
      sort: 'rating',
      order: 'asc',
      rating: 4,
      source: 'DIRECT',
      responseStatus: 'DRAFT',
      from: '2026-01-01',
      to: '2026-01-31',
      q: 'great service',
    });
  });

  it.each([['DRAFT'], ['APPROVED'], ['PUBLISHED'], ['REJECTED'], ['NONE']])(
    'accepts responseStatus=%s',
    (value) => {
      expect(parseReviewSearchParams({ responseStatus: value }).responseStatus).toBe(value);
    },
  );

  it('falls back to null for an unknown responseStatus (shared URLs must never 500)', () => {
    expect(parseReviewSearchParams({ responseStatus: 'PENDING_APPROVAL' }).responseStatus).toBe(
      null,
    );
  });

  it('reads only the first value when Next.js supplies an array', () => {
    expect(parseReviewSearchParams({ rating: ['2', '5'] }).rating).toBe(2);
  });

  describe('forgiving fallback (shared / hand-edited URLs must never 500)', () => {
    it.each([
      ['unknown sort column', { sort: 'updatedAt' }, 'sort', 'postedAt'],
      ['unknown order', { order: 'sideways' }, 'order', 'desc'],
      ['unknown source', { source: 'YELP' }, 'source', null],
      ['rating out of range', { rating: '9' }, 'rating', null],
      ['rating not a number', { rating: 'five' }, 'rating', null],
      ['page below 1', { page: '0' }, 'page', 1],
      ['page not a number', { page: 'abc' }, 'page', 1],
      ['pageSize above max', { pageSize: '9999' }, 'pageSize', REVIEW_SEARCH_DEFAULTS.pageSize],
      ['from not ISO date', { from: 'yesterday' }, 'from', null],
      ['from wrong shape', { from: '2026/01/01' }, 'from', null],
      ['from impossible day', { from: '2026-02-30' }, 'from', null],
      ['to not ISO date', { to: '01-01-2026' }, 'to', null],
    ])('%s → default', (_label, raw, key, expected) => {
      expect(parseReviewSearchParams(raw)[key]).toBe(expected);
    });

    it('clamps the search term to 200 chars by falling back to empty', () => {
      expect(parseReviewSearchParams({ q: 'x'.repeat(500) }).q).toBe('');
    });
  });
});

describe('serializeReviewSearchParams', () => {
  it('omits values that match the defaults', () => {
    expect(serializeReviewSearchParams(REVIEW_SEARCH_DEFAULTS)).toBe('');
    expect(serializeReviewSearchParams({})).toBe('');
  });

  it('emits only the keys that differ from defaults', () => {
    expect(serializeReviewSearchParams({ rating: 5 })).toBe('rating=5');
    expect(serializeReviewSearchParams({ page: 2, order: 'asc' })).toBe('page=2&order=asc');
    expect(serializeReviewSearchParams({ from: '2026-01-01', to: '2026-01-31' })).toBe(
      'from=2026-01-01&to=2026-01-31',
    );
    expect(serializeReviewSearchParams({ responseStatus: 'DRAFT' })).toBe('responseStatus=DRAFT');
    expect(serializeReviewSearchParams({ responseStatus: 'NONE' })).toBe('responseStatus=NONE');
  });

  it('round-trips: serialize → parse yields the same state', () => {
    const state = {
      page: 4,
      pageSize: MAX_PAGE_SIZE,
      sort: 'createdAt',
      order: 'asc',
      rating: 1,
      source: 'GOOGLE',
      responseStatus: 'REJECTED',
      from: '2025-12-01',
      to: '2026-02-28',
      q: 'rude staff',
    };
    const qs = serializeReviewSearchParams(state);
    const reparsed = parseReviewSearchParams(Object.fromEntries(new URLSearchParams(qs)));
    expect(reparsed).toEqual(state);
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the cleanup module BEFORE importing the route so the route picks
// up the mocked implementation (ESM hoisted mocks).
vi.mock('@/lib/reviewJobCleanup', async () => {
  const actual = await vi.importActual('@/lib/reviewJobCleanup');
  return {
    ...actual,
    cleanupReviewJobs: vi.fn(),
  };
});

import { POST } from '@/app/api/admin/jobs/cleanup/route';
import { cleanupReviewJobs } from '@/lib/reviewJobCleanup';

const TOKEN = 'x'.repeat(40);

function makeRequest({ body, auth = `Bearer ${TOKEN}` } = {}) {
  const headers = new Headers();
  if (auth) headers.set('authorization', auth);
  const init = { method: 'POST', headers };
  if (body !== undefined) {
    const serialized = typeof body === 'string' ? body : JSON.stringify(body);
    init.body = serialized;
    headers.set('content-type', 'application/json');
    headers.set('content-length', String(Buffer.byteLength(serialized)));
  }
  return new Request('http://localhost/api/admin/jobs/cleanup', init);
}

describe('POST /api/admin/jobs/cleanup', () => {
  const originalToken = process.env.ADMIN_API_TOKEN;

  beforeEach(() => {
    process.env.ADMIN_API_TOKEN = TOKEN;
    vi.mocked(cleanupReviewJobs).mockReset();
  });

  afterEach(() => {
    if (originalToken === undefined) delete process.env.ADMIN_API_TOKEN;
    else process.env.ADMIN_API_TOKEN = originalToken;
  });

  it('returns 401 when the Authorization header is missing', async () => {
    const res = await POST(makeRequest({ auth: null }));
    expect(res.status).toBe(401);
    expect(cleanupReviewJobs).not.toHaveBeenCalled();
  });

  it('returns 401 when the token is wrong', async () => {
    const res = await POST(makeRequest({ auth: `Bearer ${'y'.repeat(40)}` }));
    expect(res.status).toBe(401);
    expect(cleanupReviewJobs).not.toHaveBeenCalled();
  });

  it('returns 500 when ADMIN_API_TOKEN is not configured', async () => {
    delete process.env.ADMIN_API_TOKEN;
    const res = await POST(makeRequest());
    expect(res.status).toBe(500);
    expect(cleanupReviewJobs).not.toHaveBeenCalled();
  });

  it('uses default retention when no body is provided', async () => {
    vi.mocked(cleanupReviewJobs).mockResolvedValue({
      deletedCount: 4,
      cutoff: '2026-03-14T12:00:00.000Z',
      olderThanDays: 30,
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      data: { deletedCount: 4, cutoff: '2026-03-14T12:00:00.000Z', olderThanDays: 30 },
    });

    expect(cleanupReviewJobs).toHaveBeenCalledWith({ olderThanDays: 30 });
  });

  it('forwards a valid olderThanDays from the body', async () => {
    vi.mocked(cleanupReviewJobs).mockResolvedValue({
      deletedCount: 0,
      cutoff: '2026-04-06T12:00:00.000Z',
      olderThanDays: 7,
    });

    const res = await POST(makeRequest({ body: { olderThanDays: 7 } }));
    expect(res.status).toBe(200);
    expect(cleanupReviewJobs).toHaveBeenCalledWith({ olderThanDays: 7 });
  });

  it('rejects invalid olderThanDays in body with 400', async () => {
    const res = await POST(makeRequest({ body: { olderThanDays: -5 } }));
    expect(res.status).toBe(400);
    expect(cleanupReviewJobs).not.toHaveBeenCalled();
  });

  it('rejects non-integer olderThanDays with 400', async () => {
    const res = await POST(makeRequest({ body: { olderThanDays: 1.5 } }));
    expect(res.status).toBe(400);
    expect(cleanupReviewJobs).not.toHaveBeenCalled();
  });

  it('rejects olderThanDays above the maximum with 400', async () => {
    const res = await POST(makeRequest({ body: { olderThanDays: 1000 } }));
    expect(res.status).toBe(400);
    expect(cleanupReviewJobs).not.toHaveBeenCalled();
  });

  it('returns 400 on malformed JSON body', async () => {
    const res = await POST(makeRequest({ body: '{not-json' }));
    expect(res.status).toBe(400);
    expect(cleanupReviewJobs).not.toHaveBeenCalled();
  });

  it('returns 500 if cleanup throws unexpectedly', async () => {
    vi.mocked(cleanupReviewJobs).mockRejectedValue(new Error('db connection lost'));
    const res = await POST(makeRequest());
    expect(res.status).toBe(500);
    const json = await res.json();
    // Must not leak internal error details.
    expect(json.error).not.toMatch(/db connection/);
  });
});

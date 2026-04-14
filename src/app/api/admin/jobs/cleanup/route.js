import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/adminAuth';
import {
  cleanupReviewJobs,
  DEFAULT_RETENTION_DAYS,
  MIN_RETENTION_DAYS,
  MAX_RETENTION_DAYS,
} from '@/lib/reviewJobCleanup';

export const runtime = 'nodejs';

/**
 * POST /api/admin/jobs/cleanup
 *
 * Deletes terminal-state ReviewJob rows (COMPLETED / FAILED) older than
 * `olderThanDays` days (default 30). Requires `Authorization: Bearer <ADMIN_API_TOKEN>`.
 *
 * Body (optional JSON):
 *   { "olderThanDays": number }  // 1..365
 */
export async function POST(request) {
  const auth = verifyAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  let olderThanDays = DEFAULT_RETENTION_DAYS;

  // Body is optional — no body means "use defaults". Only reject if
  // the caller sent a body that explicitly specifies an invalid value.
  const contentLength = request.headers.get('content-length');
  const hasBody = contentLength !== null && contentLength !== '0';

  if (hasBody) {
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    if (body && Object.prototype.hasOwnProperty.call(body, 'olderThanDays')) {
      const raw = body.olderThanDays;
      if (
        typeof raw !== 'number' ||
        !Number.isInteger(raw) ||
        raw < MIN_RETENTION_DAYS ||
        raw > MAX_RETENTION_DAYS
      ) {
        return NextResponse.json(
          {
            error: `olderThanDays must be an integer between ${MIN_RETENTION_DAYS} and ${MAX_RETENTION_DAYS}`,
          },
          { status: 400 },
        );
      }
      olderThanDays = raw;
    }
  }

  try {
    const result = await cleanupReviewJobs({ olderThanDays });
    return NextResponse.json({ data: result });
  } catch (err) {
    if (err instanceof RangeError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to clean up review jobs' }, { status: 500 });
  }
}

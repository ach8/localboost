'use server';

/**
 * Server Action for the internal maintenance console.
 *
 * Auth
 * ----
 * Every invocation must carry a valid signed admin session cookie (see
 * `src/lib/adminSession.js`). Unauthenticated callers — including direct
 * POSTs to the action endpoint — receive `{ ok: false, error: 'Unauthorized' }`
 * and the DB is never touched. The plain ADMIN_API_TOKEN is neither accepted
 * from the browser nor transmitted to it; authentication is entirely
 * cookie-based after the one-time sign-in exchange.
 *
 * This action is the UI's direct path. The HTTP endpoint at
 * `/api/admin/jobs/cleanup` remains available for external / scripted
 * callers authenticating via bearer token.
 */

import { cookies } from 'next/headers';
import { cleanupReviewJobs, MIN_RETENTION_DAYS, MAX_RETENTION_DAYS } from '@/lib/reviewJobCleanup';
import { ADMIN_SESSION_COOKIE, verifyAdminSessionValue } from '@/lib/adminSession';

/**
 * @param {{ olderThanDays: number }} input
 * @returns {Promise<{ ok: true, data: { deletedCount: number, cutoff: string, olderThanDays: number } } | { ok: false, error: string }>}
 */
export async function runReviewJobCleanup(input) {
  // 1. Authenticate BEFORE validating input or touching Prisma. The session
  //    check is the authoritative gate for this action.
  const auth = verifyAdminSessionValue(cookies().get(ADMIN_SESSION_COOKIE)?.value);
  if (!auth.ok) {
    if (auth.reason === 'not-configured') {
      return { ok: false, error: 'Admin authentication is not configured on the server.' };
    }
    if (auth.reason === 'expired') {
      return { ok: false, error: 'Your admin session has expired. Please sign in again.' };
    }
    return { ok: false, error: 'Unauthorized. Please sign in as an admin.' };
  }

  // 2. Validate input.
  const olderThanDays = input?.olderThanDays;
  if (
    !Number.isInteger(olderThanDays) ||
    olderThanDays < MIN_RETENTION_DAYS ||
    olderThanDays > MAX_RETENTION_DAYS
  ) {
    return {
      ok: false,
      error: `olderThanDays must be an integer between ${MIN_RETENTION_DAYS} and ${MAX_RETENTION_DAYS}`,
    };
  }

  // 3. Execute.
  try {
    const data = await cleanupReviewJobs({ olderThanDays });
    return { ok: true, data };
  } catch (err) {
    if (err instanceof RangeError) {
      return { ok: false, error: err.message };
    }
    // Do not leak internal error details to the UI.
    return { ok: false, error: 'Failed to clean up review jobs' };
  }
}

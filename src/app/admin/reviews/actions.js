'use server';

/**
 * Server Actions for the Review Management Dashboard.
 *
 * Auth
 * ----
 * Mirrors `src/app/admin/maintenance/actions.js`: every invocation must carry
 * a valid signed admin session cookie (see `src/lib/adminSession.js`). The
 * session check runs BEFORE input validation and BEFORE any Prisma call, so a
 * direct POST to the action endpoint without the cookie is rejected with
 * `{ ok: false, error: 'Unauthorized…' }` and the database is never touched.
 * The plain ADMIN_API_TOKEN is neither accepted from nor sent to the browser.
 *
 * Destructive
 * -----------
 * `deleteReview` performs a hard delete. The 4-second Undo grace period is a
 * client-side affordance only — by the time this action runs, the operator's
 * window to cancel has closed and the row (plus its cascading
 * `ReviewResponse`) is removed permanently.
 */

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { ADMIN_SESSION_COOKIE, verifyAdminSessionValue } from '@/lib/adminSession';

/**
 * @param {{ reviewId: string }} input
 * @returns {Promise<{ ok: true, deleted: boolean } | { ok: false, error: string }>}
 */
export async function deleteReview(input) {
  // 1. Authenticate — authoritative gate. Never reveal whether the id exists
  //    to an unauthenticated caller.
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
  const reviewId = input?.reviewId;
  if (typeof reviewId !== 'string' || reviewId.trim().length === 0 || reviewId.length > 200) {
    return { ok: false, error: 'reviewId must be a non-empty string.' };
  }

  // 3. Execute. `deleteMany` is idempotent — a missing row yields count=0
  //    rather than throwing, so a double-fire after the Undo window is
  //    harmless. `ReviewResponse` rows cascade via the FK; `ReviewJob` rows
  //    are intentionally untouched (no FK by design — see schema.prisma).
  try {
    const { count } = await prisma.googleReview.deleteMany({ where: { id: reviewId } });
    revalidatePath('/admin/reviews');
    return { ok: true, deleted: count > 0 };
  } catch {
    // Do not leak internal error details to the UI.
    return { ok: false, error: 'Failed to delete review.' };
  }
}

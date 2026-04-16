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
 *
 * Response workflow
 * -----------------
 * `approveReviewResponse` transitions a DRAFT (or previously REJECTED)
 * response to APPROVED. `regenerateReviewResponse` runs the OpenAI
 * generation + moderation pipeline via `generateAndStoreReviewResponse`,
 * which upserts the `ReviewResponse` row back to status=DRAFT with the
 * freshly generated content — effectively "reject the current draft and
 * replace it with a new one".
 */

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { ADMIN_SESSION_COOKIE, verifyAdminSessionValue } from '@/lib/adminSession';
import { generateAndStoreReviewResponse } from '@/lib/reviewResponses';

const ID_MAX_LENGTH = 200;
// Bulk actions accept an array of ids. Capped well above any realistic
// per-page selection (MAX_PAGE_SIZE × a few pages) so operators are never
// blocked, but bounded so a forged POST cannot ship a million-row IN clause
// to Postgres.
const BULK_MAX_IDS = 500;

function authGuard() {
  const auth = verifyAdminSessionValue(cookies().get(ADMIN_SESSION_COOKIE)?.value);
  if (auth.ok) return null;
  if (auth.reason === 'not-configured') {
    return { ok: false, error: 'Admin authentication is not configured on the server.' };
  }
  if (auth.reason === 'expired') {
    return { ok: false, error: 'Your admin session has expired. Please sign in again.' };
  }
  return { ok: false, error: 'Unauthorized. Please sign in as an admin.' };
}

function validateId(value, field) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > ID_MAX_LENGTH) {
    return { ok: false, error: `${field} must be a non-empty string.` };
  }
  return { ok: true };
}

function validateIdArray(value, field) {
  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false, error: `${field} must be a non-empty array.` };
  }
  if (value.length > BULK_MAX_IDS) {
    return { ok: false, error: `${field} cannot contain more than ${BULK_MAX_IDS} ids.` };
  }
  const ids = [];
  for (const v of value) {
    if (typeof v !== 'string' || v.trim().length === 0 || v.length > ID_MAX_LENGTH) {
      return { ok: false, error: `${field} must contain only non-empty string ids.` };
    }
    ids.push(v);
  }
  // De-duplicate so the reported `count` is meaningful and the IN-clause
  // stays as small as possible.
  return { ok: true, ids: [...new Set(ids)] };
}

/**
 * @param {{ reviewId: string }} input
 * @returns {Promise<{ ok: true, deleted: boolean } | { ok: false, error: string }>}
 */
export async function deleteReview(input) {
  // 1. Authenticate — authoritative gate. Never reveal whether the id exists
  //    to an unauthenticated caller.
  const denied = authGuard();
  if (denied) return denied;

  // 2. Validate input.
  const reviewId = input?.reviewId;
  const v = validateId(reviewId, 'reviewId');
  if (!v.ok) return v;

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

/**
 * Approve an AI-generated review response (DRAFT → APPROVED).
 *
 * @param {{ responseId: string }} input
 * @returns {Promise<{ ok: true, response: { id: string, status: string } } | { ok: false, error: string }>}
 */
export async function approveReviewResponse(input) {
  const denied = authGuard();
  if (denied) return denied;

  const responseId = input?.responseId;
  const v = validateId(responseId, 'responseId');
  if (!v.ok) return v;

  try {
    const updated = await prisma.reviewResponse.update({
      where: { id: responseId },
      data: { status: 'APPROVED' },
      select: { id: true, status: true },
    });
    revalidatePath('/admin/reviews');
    return { ok: true, response: updated };
  } catch (err) {
    if (err?.code === 'P2025') {
      return { ok: false, error: 'Response no longer exists.' };
    }
    return { ok: false, error: 'Failed to approve response.' };
  }
}

/**
 * Discard the current draft response and generate a fresh one. Reuses the
 * existing `generateAndStoreReviewResponse` pipeline (OpenAI + moderation +
 * upsert), which overwrites the existing `ReviewResponse` row and resets
 * its status back to DRAFT.
 *
 * @param {{ reviewId: string }} input
 */
export async function regenerateReviewResponse(input) {
  const denied = authGuard();
  if (denied) return denied;

  const reviewId = input?.reviewId;
  const v = validateId(reviewId, 'reviewId');
  if (!v.ok) return v;

  let review;
  try {
    review = await prisma.googleReview.findUnique({
      where: { id: reviewId },
      include: { business: { select: { name: true } } },
    });
  } catch {
    return { ok: false, error: 'Failed to load review.' };
  }
  if (!review) {
    return { ok: false, error: 'Review no longer exists.' };
  }
  if (!review.business?.name) {
    return { ok: false, error: 'Review is missing business metadata required for regeneration.' };
  }

  try {
    const saved = await generateAndStoreReviewResponse({
      reviewId,
      businessName: review.business.name,
      rating: review.rating,
      comment: review.comment ?? '',
      reviewerName: review.reviewerName ?? undefined,
    });
    revalidatePath('/admin/reviews');
    return {
      ok: true,
      response: {
        id: saved.id,
        status: saved.status,
        content: saved.content,
        updatedAt: saved.updatedAt,
      },
    };
  } catch (err) {
    if (err?.name === 'ModerationError') {
      return {
        ok: false,
        error: 'Generated response was flagged by moderation. Please try again.',
      };
    }
    // Never leak internal error details (OpenAI keys, stack traces, etc.).
    return { ok: false, error: 'Failed to regenerate response.' };
  }
}

/**
 * Approve every supplied `ReviewResponse` row in a single round-trip.
 *
 * Only DRAFT/REJECTED rows are transitioned. PUBLISHED rows are intentionally
 * skipped — once a response has gone out to the upstream channel its status is
 * authoritative there, not here. Already-APPROVED rows are a no-op (the WHERE
 * clause naturally matches them too, but `updateMany` is idempotent and the
 * caller only cares about the count).
 *
 * @param {{ responseIds: string[] }} input
 * @returns {Promise<{ ok: true, approved: number, requested: number } | { ok: false, error: string }>}
 */
export async function bulkApproveReviewResponses(input) {
  const denied = authGuard();
  if (denied) return denied;

  const v = validateIdArray(input?.responseIds, 'responseIds');
  if (!v.ok) return v;

  try {
    const { count } = await prisma.reviewResponse.updateMany({
      where: { id: { in: v.ids }, status: { not: 'PUBLISHED' } },
      data: { status: 'APPROVED' },
    });
    revalidatePath('/admin/reviews');
    return { ok: true, approved: count, requested: v.ids.length };
  } catch {
    return { ok: false, error: 'Failed to approve responses.' };
  }
}

/**
 * Hard-delete every supplied review row in a single round-trip. Cascades take
 * the matching `ReviewResponse` rows with them. Unlike the single-row
 * `deleteReview`, there is no client-side Undo window for bulk operations —
 * the panel surfaces an explicit confirmation step before invoking this.
 *
 * @param {{ reviewIds: string[] }} input
 * @returns {Promise<{ ok: true, deleted: number, requested: number } | { ok: false, error: string }>}
 */
export async function bulkDeleteReviews(input) {
  const denied = authGuard();
  if (denied) return denied;

  const v = validateIdArray(input?.reviewIds, 'reviewIds');
  if (!v.ok) return v;

  try {
    const { count } = await prisma.googleReview.deleteMany({ where: { id: { in: v.ids } } });
    revalidatePath('/admin/reviews');
    return { ok: true, deleted: count, requested: v.ids.length };
  } catch {
    return { ok: false, error: 'Failed to delete reviews.' };
  }
}

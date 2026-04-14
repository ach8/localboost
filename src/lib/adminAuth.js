/**
 * Shared-secret admin auth for internal/ops endpoints.
 *
 * Expects a `Bearer <token>` Authorization header and compares against
 * ADMIN_API_TOKEN using a timing-safe comparison. Kept deliberately
 * simple — if/when we add real admin users, this can be swapped for
 * a session/JWT check without touching callers beyond the import.
 */

import { timingSafeEqual } from 'node:crypto';

const BEARER_PREFIX = 'Bearer ';

function extractBearerToken(authHeader) {
  if (typeof authHeader !== 'string') return null;
  if (!authHeader.startsWith(BEARER_PREFIX)) return null;
  const token = authHeader.slice(BEARER_PREFIX.length).trim();
  return token.length > 0 ? token : null;
}

function safeEqual(a, b) {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * @param {Request} request
 * @param {{ expectedToken?: string | undefined }} [options]
 * @returns {{ ok: true } | { ok: false, status: 401 | 500, message: string }}
 */
export function verifyAdminRequest(request, { expectedToken } = {}) {
  const configured = expectedToken !== undefined ? expectedToken : process.env.ADMIN_API_TOKEN;

  if (!configured || typeof configured !== 'string' || configured.length === 0) {
    // Fail closed — never allow admin calls when the token isn't configured.
    return {
      ok: false,
      status: 500,
      message: 'Admin API token is not configured on the server',
    };
  }

  const provided = extractBearerToken(request.headers.get('authorization'));
  if (!provided) {
    return { ok: false, status: 401, message: 'Missing or malformed Authorization header' };
  }

  if (!safeEqual(provided, configured)) {
    return { ok: false, status: 401, message: 'Invalid admin token' };
  }

  return { ok: true };
}

'use server';

/**
 * Admin login / logout Server Actions.
 *
 * `signInAdmin` is the *only* place in the codebase where the plain
 * ADMIN_API_TOKEN is compared against operator-submitted input. It runs
 * exclusively on the server, verifies the submitted value in constant time,
 * and — on success — sets an HttpOnly signed session cookie. The browser
 * holds the session cookie, never the raw token.
 *
 * After login, all other admin Server Actions authenticate against the
 * session cookie (see `src/lib/adminSession.js`).
 */

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  ADMIN_SESSION_COOKIE,
  adminSessionCookieOptions,
  createAdminSessionValue,
  tokensMatch,
} from '@/lib/adminSession';

export async function signInAdmin(_prevState, formData) {
  const configured = process.env.ADMIN_API_TOKEN;
  if (typeof configured !== 'string' || configured.length === 0) {
    return { error: 'Admin authentication is not configured on the server.' };
  }

  const submitted = formData?.get?.('token');
  if (typeof submitted !== 'string' || submitted.length === 0) {
    return { error: 'Please enter your admin token.' };
  }

  if (!tokensMatch(submitted, configured)) {
    return { error: 'Invalid admin token.' };
  }

  let sessionValue;
  try {
    sessionValue = createAdminSessionValue();
  } catch {
    return { error: 'Admin authentication is not configured on the server.' };
  }

  cookies().set(ADMIN_SESSION_COOKIE, sessionValue, adminSessionCookieOptions());

  redirect('/admin/maintenance');
}

export async function signOutAdmin() {
  cookies().set(ADMIN_SESSION_COOKIE, '', {
    ...adminSessionCookieOptions(),
    maxAge: 0,
  });
  redirect('/admin/login');
}

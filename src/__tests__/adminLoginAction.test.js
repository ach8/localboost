import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock next/headers & next/navigation — these live in the Next runtime and
// aren't importable under jsdom without a stub.
const cookieStore = { set: vi.fn() };
vi.mock('next/headers', () => ({
  cookies: () => cookieStore,
}));

const REDIRECT_SENTINEL = Symbol('NEXT_REDIRECT');
vi.mock('next/navigation', () => ({
  redirect: vi.fn((path) => {
    const err = new Error(`REDIRECT:${path}`);
    err[REDIRECT_SENTINEL] = path;
    throw err;
  }),
}));

import { signInAdmin, signOutAdmin } from '@/app/admin/login/actions';
import { redirect } from 'next/navigation';
import { ADMIN_SESSION_COOKIE, verifyAdminSessionValue } from '@/lib/adminSession';

const TOKEN = 'correct-horse-battery-staple-correct-horse';

function fd(entries) {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

describe('signInAdmin', () => {
  const originalToken = process.env.ADMIN_API_TOKEN;

  beforeEach(() => {
    process.env.ADMIN_API_TOKEN = TOKEN;
    cookieStore.set.mockReset();
    vi.mocked(redirect).mockClear();
  });

  afterEach(() => {
    if (originalToken === undefined) delete process.env.ADMIN_API_TOKEN;
    else process.env.ADMIN_API_TOKEN = originalToken;
  });

  it('rejects an empty submission with a friendly error', async () => {
    const result = await signInAdmin(null, fd({ token: '' }));
    expect(result.error).toMatch(/please enter/i);
    expect(cookieStore.set).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('rejects a wrong token without setting a cookie', async () => {
    const result = await signInAdmin(null, fd({ token: 'wrong-value' }));
    expect(result.error).toMatch(/invalid admin token/i);
    expect(cookieStore.set).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('returns an error when ADMIN_API_TOKEN is not configured', async () => {
    delete process.env.ADMIN_API_TOKEN;
    const result = await signInAdmin(null, fd({ token: TOKEN }));
    expect(result.error).toMatch(/not configured/i);
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it('on success: sets a signed HttpOnly cookie and redirects to the console', async () => {
    await expect(signInAdmin(null, fd({ token: TOKEN }))).rejects.toThrow(/REDIRECT:/);

    expect(redirect).toHaveBeenCalledWith('/admin/maintenance');
    expect(cookieStore.set).toHaveBeenCalledTimes(1);

    const [name, value, opts] = cookieStore.set.mock.calls[0];
    expect(name).toBe(ADMIN_SESSION_COOKIE);

    // The cookie must NOT be the raw token.
    expect(value).not.toBe(TOKEN);
    expect(value).not.toContain(TOKEN);

    // And it must verify against the real session module.
    expect(verifyAdminSessionValue(value).ok).toBe(true);

    // Security flags.
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe('strict');
    expect(opts.path).toBe('/');
    expect(opts.maxAge).toBeGreaterThan(0);
  });
});

describe('signOutAdmin', () => {
  beforeEach(() => {
    cookieStore.set.mockReset();
    vi.mocked(redirect).mockClear();
  });

  it('clears the session cookie and redirects to /admin/login', async () => {
    await expect(signOutAdmin()).rejects.toThrow(/REDIRECT:/);
    expect(redirect).toHaveBeenCalledWith('/admin/login');

    const [name, value, opts] = cookieStore.set.mock.calls[0];
    expect(name).toBe(ADMIN_SESSION_COOKIE);
    expect(value).toBe('');
    expect(opts.maxAge).toBe(0);
    expect(opts.httpOnly).toBe(true);
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  ADMIN_SESSION_COOKIE,
  DEFAULT_SESSION_TTL_SECONDS,
  adminSessionCookieOptions,
  createAdminSessionValue,
  tokensMatch,
  verifyAdminSessionValue,
} from '@/lib/adminSession';

const TOKEN = 'a'.repeat(40);
const OTHER_TOKEN = 'b'.repeat(40);

describe('adminSession', () => {
  const originalToken = process.env.ADMIN_API_TOKEN;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.ADMIN_API_TOKEN = TOKEN;
  });

  afterEach(() => {
    if (originalToken === undefined) delete process.env.ADMIN_API_TOKEN;
    else process.env.ADMIN_API_TOKEN = originalToken;
    process.env.NODE_ENV = originalNodeEnv;
  });

  describe('createAdminSessionValue / verifyAdminSessionValue', () => {
    it('round-trips a freshly signed value', () => {
      const value = createAdminSessionValue();
      const result = verifyAdminSessionValue(value);
      expect(result.ok).toBe(true);
      expect(result.payload.role).toBe('admin');
    });

    it('refuses verification when no cookie is provided', () => {
      expect(verifyAdminSessionValue(undefined)).toEqual({ ok: false, reason: 'missing' });
      expect(verifyAdminSessionValue('')).toEqual({ ok: false, reason: 'missing' });
      expect(verifyAdminSessionValue(null)).toEqual({ ok: false, reason: 'missing' });
    });

    it('rejects malformed cookies', () => {
      expect(verifyAdminSessionValue('not-a-signed-value').ok).toBe(false);
      expect(verifyAdminSessionValue('onlyone.').ok).toBe(false);
      expect(verifyAdminSessionValue('.onlyone').ok).toBe(false);
    });

    it('rejects a cookie signed with a DIFFERENT token', () => {
      const signedByOther = (() => {
        process.env.ADMIN_API_TOKEN = OTHER_TOKEN;
        return createAdminSessionValue();
      })();
      process.env.ADMIN_API_TOKEN = TOKEN; // restore real verifier secret

      const result = verifyAdminSessionValue(signedByOther);
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('bad-signature');
    });

    it('rejects a cookie whose payload has been tampered with', () => {
      const value = createAdminSessionValue();
      const [encoded, sig] = value.split('.');
      // Flip a byte in the payload (still valid base64url).
      const tampered = Buffer.from(encoded, 'base64url');
      tampered[0] = tampered[0] ^ 0x01;
      const tamperedValue = `${tampered.toString('base64url')}.${sig}`;
      expect(verifyAdminSessionValue(tamperedValue).ok).toBe(false);
    });

    it('rejects an expired cookie', () => {
      const value = createAdminSessionValue({
        now: () => 1_000_000_000_000,
        ttlSeconds: 60,
      });
      // 2 minutes later, beyond the 60-second TTL.
      const result = verifyAdminSessionValue(value, {
        now: () => 1_000_000_000_000 + 120_000,
      });
      expect(result).toEqual({ ok: false, reason: 'expired' });
    });

    it('fails closed when ADMIN_API_TOKEN is not configured', () => {
      delete process.env.ADMIN_API_TOKEN;
      expect(verifyAdminSessionValue('anything').reason).toBe('not-configured');
      expect(() => createAdminSessionValue()).toThrow(/not configured/i);
    });

    it('a valid cookie stops being valid after the token rotates', () => {
      const value = createAdminSessionValue();
      expect(verifyAdminSessionValue(value).ok).toBe(true);

      // Rotate secret — all existing sessions must invalidate.
      process.env.ADMIN_API_TOKEN = OTHER_TOKEN;
      expect(verifyAdminSessionValue(value).ok).toBe(false);
    });
  });

  describe('adminSessionCookieOptions', () => {
    it('sets secure HttpOnly SameSite=Strict scope-root defaults', () => {
      process.env.NODE_ENV = 'production';
      const opts = adminSessionCookieOptions();
      expect(opts.httpOnly).toBe(true);
      expect(opts.secure).toBe(true);
      expect(opts.sameSite).toBe('strict');
      expect(opts.path).toBe('/');
      expect(opts.maxAge).toBe(DEFAULT_SESSION_TTL_SECONDS);
    });

    it('relaxes Secure in non-production so local dev works over http', () => {
      process.env.NODE_ENV = 'development';
      expect(adminSessionCookieOptions().secure).toBe(false);
    });
  });

  describe('tokensMatch', () => {
    it('returns true only for identical strings of the same length', () => {
      expect(tokensMatch('abc', 'abc')).toBe(true);
      expect(tokensMatch('abc', 'abd')).toBe(false);
      expect(tokensMatch('abc', 'abcd')).toBe(false);
      expect(tokensMatch('', '')).toBe(true);
    });

    it('rejects non-string inputs', () => {
      expect(tokensMatch(undefined, 'x')).toBe(false);
      expect(tokensMatch('x', null)).toBe(false);
    });
  });

  it('exports a stable cookie name', () => {
    expect(ADMIN_SESSION_COOKIE).toMatch(/^[a-z_]+$/i);
  });
});

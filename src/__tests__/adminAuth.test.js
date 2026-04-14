import { describe, it, expect } from 'vitest';
import { verifyAdminRequest } from '@/lib/adminAuth';

function makeRequest(authHeader) {
  const headers = new Headers();
  if (authHeader !== undefined) headers.set('authorization', authHeader);
  return new Request('http://localhost/api/admin/jobs/cleanup', {
    method: 'POST',
    headers,
  });
}

const TOKEN = 'a'.repeat(40);

describe('verifyAdminRequest', () => {
  it('returns ok for a matching Bearer token', () => {
    const result = verifyAdminRequest(makeRequest(`Bearer ${TOKEN}`), {
      expectedToken: TOKEN,
    });
    expect(result.ok).toBe(true);
  });

  it('rejects when the Authorization header is missing', () => {
    const result = verifyAdminRequest(makeRequest(undefined), {
      expectedToken: TOKEN,
    });
    expect(result).toEqual({
      ok: false,
      status: 401,
      message: expect.stringMatching(/missing or malformed/i),
    });
  });

  it('rejects when the scheme is not Bearer', () => {
    const result = verifyAdminRequest(makeRequest(`Basic ${TOKEN}`), {
      expectedToken: TOKEN,
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
  });

  it('rejects when the token is wrong', () => {
    const result = verifyAdminRequest(makeRequest(`Bearer ${'b'.repeat(40)}`), {
      expectedToken: TOKEN,
    });
    expect(result).toEqual({
      ok: false,
      status: 401,
      message: expect.stringMatching(/invalid admin token/i),
    });
  });

  it('rejects when the token is the right length but different', () => {
    const other = 'c'.repeat(TOKEN.length);
    const result = verifyAdminRequest(makeRequest(`Bearer ${other}`), {
      expectedToken: TOKEN,
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
  });

  it('fails closed when no admin token is configured', () => {
    const result = verifyAdminRequest(makeRequest(`Bearer ${TOKEN}`), {
      expectedToken: '',
    });
    expect(result).toEqual({
      ok: false,
      status: 500,
      message: expect.stringMatching(/not configured/i),
    });
  });
});

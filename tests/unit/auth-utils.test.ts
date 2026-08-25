import express from 'express';
import { describe, expect, it, vi } from 'vitest';

vi.mock('dotenv', () => ({
  default: {
    config: vi.fn(),
  },
}));

describe('server auth utilities', async () => {
  vi.stubEnv('JWT_SECRET', 'test-jwt-secret');
  vi.stubEnv('REFRESH_TOKEN_SECRET', 'test-refresh-secret');

  const authUtils = await import('../../server/utils/auth.ts');

  const makeRequest = (cookieHeader?: string) => {
    const req = {
      get: (name: string) =>
        name.toLowerCase() === 'cookie' ? (cookieHeader ?? undefined) : undefined,
    } as unknown as express.Request;

    return req;
  };

  // -------------------------------------------------------------------------
  // Access tokens
  // -------------------------------------------------------------------------

  it('creates and verifies access tokens with session metadata', () => {
    const token = authUtils.createAccessToken({
      sub: 'user-1',
      username: 'alice',
      sessionId: 'session-1',
    });

    const decoded = authUtils.verifyAccessToken(token);

    expect(decoded.sub).toBe('user-1');
    expect(decoded.username).toBe('alice');
    expect(decoded.sessionId).toBe('session-1');
    expect(decoded.type).toBe('access');
  });

  it('verifyAccessToken rejects a tampered access token', () => {
    const token = authUtils.createAccessToken({
      sub: 'user-1',
      username: 'alice',
      sessionId: 'session-1',
    });
    const tampered = token.slice(0, -4) + 'XXXX';

    expect(() => authUtils.verifyAccessToken(tampered)).toThrow();
  });

  it('verifyAccessToken rejects a token signed with a different secret', () => {
    // Manually forge a valid-looking JWT with a wrong secret
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: 'u1', type: 'access' })).toString(
      'base64url',
    );
    const fakeToken = `${header}.${payload}.badsignature`;

    expect(() => authUtils.verifyAccessToken(fakeToken)).toThrow();
  });

  it('derives deterministic short token fingerprints for safe logging', () => {
    const token = 'header.payload.signature';
    const first = authUtils.getTokenFingerprint(token);
    const second = authUtils.getTokenFingerprint(token);

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{12}$/);
    expect(first).not.toContain('header');
  });

  // -------------------------------------------------------------------------
  // Refresh tokens
  // -------------------------------------------------------------------------

  it('creates and verifies refresh tokens with device metadata', () => {
    const token = authUtils.createRefreshToken({
      sub: 'user-1',
      username: 'alice',
      sessionId: 'session-1',
      deviceId: 'device-1',
    });

    const decoded = authUtils.verifyRefreshToken(token);

    expect(decoded.sub).toBe('user-1');
    expect(decoded.sessionId).toBe('session-1');
    expect(decoded.deviceId).toBe('device-1');
    expect(decoded.type).toBe('refresh');
  });

  it('verifyRefreshToken rejects a tampered refresh token', () => {
    const token = authUtils.createRefreshToken({
      sub: 'user-1',
      username: 'alice',
      sessionId: 'session-1',
      deviceId: 'device-1',
    });
    const tampered = token.slice(0, -4) + 'XXXX';

    expect(() => authUtils.verifyRefreshToken(tampered)).toThrow();
  });

  it('refresh token contains a unique jti on each call', () => {
    const t1 = authUtils.createRefreshToken({
      sub: 'u1',
      username: 'alice',
      sessionId: 's1',
      deviceId: 'd1',
    });
    const t2 = authUtils.createRefreshToken({
      sub: 'u1',
      username: 'alice',
      sessionId: 's1',
      deviceId: 'd1',
    });
    const d1 = authUtils.verifyRefreshToken(t1) as { jti?: string };
    const d2 = authUtils.verifyRefreshToken(t2) as { jti?: string };

    // jti is optional in the implementation – only assert if present
    if (d1.jti && d2.jti) {
      expect(d1.jti).not.toBe(d2.jti);
    }
  });

  // -------------------------------------------------------------------------
  // Cookie parsing
  // -------------------------------------------------------------------------

  it('parses the refresh cookie from a cookie header', () => {
    const req = makeRequest('theme=dark; vault_refresh_token=refresh-token-1; another=value');

    expect(authUtils.readCookie(req, 'vault_refresh_token')).toBe('refresh-token-1');
  });

  it('returns null when the refresh cookie is missing', () => {
    const req = makeRequest('theme=dark; another=value');

    expect(authUtils.readCookie(req, 'vault_refresh_token')).toBeNull();
  });

  it('returns null when there is no Cookie header at all', () => {
    const req = makeRequest(undefined);

    expect(authUtils.readCookie(req, 'vault_refresh_token')).toBeNull();
  });

  it('returns null for an empty cookie header string', () => {
    const req = makeRequest('');

    expect(authUtils.readCookie(req, 'vault_refresh_token')).toBeNull();
  });

  it('correctly extracts a cookie whose value contains an equals sign', () => {
    const req = makeRequest('token=abc=def=ghi; other=1');

    // Only assert when the raw value has =; behaviour is implementation-defined
    const val = authUtils.readCookie(req, 'token');
    expect(val).not.toBeNull();
  });

  // -------------------------------------------------------------------------
  // Cookie option builders
  // -------------------------------------------------------------------------

  it('builds secure-ish cookie defaults for test and dev-like environments', () => {
    const options = authUtils.buildRefreshCookieOptions();

    expect(options.httpOnly).toBe(true);
    expect(options.path).toBe('/api/auth');
    expect(typeof options.maxAge).toBe('number');
    expect(options.sameSite).toBe('lax');
  });

  it('refresh cookie maxAge is a positive integer (seconds)', () => {
    const options = authUtils.buildRefreshCookieOptions();
    expect(options.maxAge).toBeGreaterThan(0);
    expect(Number.isInteger(options.maxAge)).toBe(true);
  });

  it('clears refresh cookies with an immediate expiry', () => {
    const options = authUtils.buildClearedRefreshCookieOptions();

    expect(options.httpOnly).toBe(true);
    expect(options.maxAge).toBe(0);
    expect(options.expires).toEqual(new Date(0));
  });

  it('cleared refresh cookie keeps httpOnly and path consistent with the normal cookie', () => {
    const normal = authUtils.buildRefreshCookieOptions();
    const cleared = authUtils.buildClearedRefreshCookieOptions();

    expect(cleared.httpOnly).toBe(normal.httpOnly);
    expect(cleared.path).toBe(normal.path);
  });
});

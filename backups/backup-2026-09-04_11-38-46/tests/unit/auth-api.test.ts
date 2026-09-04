import { beforeEach, describe, expect, it, vi } from 'vitest';

const sessionMocks = vi.hoisted(() => ({
  clearAuthToken: vi.fn(),
  clearCloudSessionHint: vi.fn(),
  getAuthToken: vi.fn(() => null),
  getDeviceId: vi.fn(() => 'test-device-id'),
  saveCloudSessionHint: vi.fn(),
  setAuthToken: vi.fn(),
}));

vi.mock('../../src/lib/auth-session.ts', () => sessionMocks);

import {
  authenticateVaultSession,
  changeAccountPassword,
  getAuthenticatedProfile,
  logoutVaultSession,
  refreshVaultSession,
  revokeVaultDeviceSession,
  updateAuthenticatedProfile,
} from '../../src/lib/auth-api.ts';

const CAPTCHA_TOKEN = 'test-captcha-token-abcdefghijklmnopqrstuvwxyz';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeOkResponse = (body: unknown, status = 200): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as Response;

const makeErrorResponse = (status: number, code: string, message: string): Response =>
  ({
    ok: false,
    status,
    json: async () => ({
      success: false,
      error: { code, message },
    }),
  }) as Response;

// ---------------------------------------------------------------------------
// authenticateVaultSession
// ---------------------------------------------------------------------------

describe('authenticateVaultSession', () => {
  beforeEach(() => {
    sessionMocks.getAuthToken.mockReset();
    sessionMocks.getAuthToken.mockReturnValue(null);
    sessionMocks.getDeviceId.mockReset();
    sessionMocks.getDeviceId.mockReturnValue('test-device-id');
    sessionMocks.setAuthToken.mockReset();
    sessionMocks.clearAuthToken.mockReset();
    sessionMocks.saveCloudSessionHint.mockReset();
    vi.restoreAllMocks();
  });

  it('uses the login endpoint and stores the returned token', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      makeOkResponse({
        success: true,
        data: { token: 'token-1', user: { id: 'user-1', username: 'alice' } },
      }),
    );

    const result = await authenticateVaultSession(
      'login',
      'alice',
      'AccountPass123!',
      CAPTCHA_TOKEN,
    );

    expect(result.token).toBe('token-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/auth/login');
    expect(sessionMocks.setAuthToken).toHaveBeenCalledWith(
      'token-1',
      expect.objectContaining({ rememberMe: false }),
    );
    expect(sessionMocks.saveCloudSessionHint).toHaveBeenCalledWith('alice');
  });

  it('uses the register endpoint for account creation', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      makeOkResponse({
        success: true,
        data: { token: 'token-2', user: { id: 'user-2', username: 'carol' } },
      }),
    );

    await authenticateVaultSession('register', 'carol', 'AccountPass123!', CAPTCHA_TOKEN);

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/auth/register');
  });

  it('includes the deviceId from auth-session in the request body', async () => {
    sessionMocks.getDeviceId.mockReturnValue('my-device-abc');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      makeOkResponse({
        success: true,
        data: { token: 'token-3', user: { id: 'user-3', username: 'bob' } },
      }),
    );

    await authenticateVaultSession('login', 'bob', 'AccountPass123!', CAPTCHA_TOKEN);

    const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string);
    expect(body.deviceId).toBe('my-device-abc');
  });

  it('forwards the optional masterKey in the request body', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      makeOkResponse({
        success: true,
        data: { token: 'token-4', user: { id: 'u4', username: 'dave' } },
      }),
    );

    await authenticateVaultSession(
      'register',
      'dave',
      'AccountPass123!',
      CAPTCHA_TOKEN,
      'masterKeyValue',
    );

    const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string);
    expect(body.masterKey).toBe('masterKeyValue');
  });

  it('surfaces generic invalid-credential failures without probing account existence', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      makeErrorResponse(401, 'INVALID_CREDENTIALS', 'Invalid username or password.'),
    );

    await expect(
      authenticateVaultSession('login', 'alice', 'SamePass123!', CAPTCHA_TOKEN),
    ).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
      status: 401,
    });
  });

  it('throws with a fallback message when the response has no error body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('no json');
      },
    } as unknown as Response);

    const err = await authenticateVaultSession('login', 'alice', 'Pass123!', CAPTCHA_TOKEN).catch(
      (e) => e,
    );
    expect(err.message).toMatch(/Authentication failed/i);
    expect(err.status).toBe(500);
  });

  it('wraps network failures in a stable auth error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('socket hang up'));

    const err = await authenticateVaultSession('login', 'alice', 'Pass123!', CAPTCHA_TOKEN).catch(
      (e) => e,
    );
    expect(err.message).toMatch(/Unable to reach the server/i);
    expect(err.code).toBe('NETWORK_ERROR');
  });

  it('throws when the server returns success:false', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      makeOkResponse({ success: false, error: { code: 'SERVER_ERROR', message: 'Oops' } }),
    );

    await expect(
      authenticateVaultSession('login', 'alice', 'Pass123!', CAPTCHA_TOKEN),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// refreshVaultSession
// ---------------------------------------------------------------------------

describe('refreshVaultSession', () => {
  beforeEach(() => {
    sessionMocks.setAuthToken.mockReset();
    sessionMocks.saveCloudSessionHint.mockReset();
    vi.restoreAllMocks();
  });

  it('refreshes the session and updates the stored token', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      makeOkResponse({
        success: true,
        data: { token: 'new-token', user: { id: 'u1', username: 'alice' } },
      }),
    );

    const data = await refreshVaultSession();

    expect(data.token).toBe('new-token');
    expect(sessionMocks.setAuthToken).toHaveBeenCalledWith(
      'new-token',
      expect.objectContaining({ rememberMe: true }),
    );
  });

  it('throws when the refresh endpoint returns 401', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      makeErrorResponse(401, 'SESSION_EXPIRED', 'Session expired.'),
    );

    const err = await refreshVaultSession().catch((e) => e);
    expect(err.status).toBe(401);
    expect(err.code).toBe('SESSION_EXPIRED');
  });

  it('rejects malformed successful refresh payloads', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      makeOkResponse({
        success: true,
        data: { user: { id: 'u1', username: 'alice' } },
      }),
    );

    const err = await refreshVaultSession().catch((e) => e);
    expect(err.code).toBe('INVALID_AUTH_RESPONSE');
  });
});

// ---------------------------------------------------------------------------
// logoutVaultSession
// ---------------------------------------------------------------------------

describe('logoutVaultSession', () => {
  it('calls the logout endpoint and clears the session hint', async () => {
    sessionMocks.clearAuthToken.mockReset();
    sessionMocks.clearCloudSessionHint.mockReset();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) } as Response);

    await logoutVaultSession();

    expect(sessionMocks.clearAuthToken).toHaveBeenCalledTimes(1);
    expect(sessionMocks.clearCloudSessionHint).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/auth/logout');
  });

  it('does not throw even if the logout request fails', async () => {
    sessionMocks.clearAuthToken.mockReset();
    sessionMocks.clearCloudSessionHint.mockReset();
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('network error'));

    await expect(logoutVaultSession()).resolves.toBeUndefined();
    expect(sessionMocks.clearAuthToken).toHaveBeenCalledTimes(1);
    expect(sessionMocks.clearCloudSessionHint).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// revokeVaultDeviceSession
// ---------------------------------------------------------------------------

describe('revokeVaultDeviceSession', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('posts to the revoke endpoint and returns the revoked count', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      makeOkResponse({
        success: true,
        data: { revokedCount: 2, sessions: [] },
      }),
    );

    const result = await revokeVaultDeviceSession({ revokeAllOther: true });
    expect(result.revokedCount).toBe(2);
  });

  it('throws with the server error code on failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      makeErrorResponse(403, 'UNAUTHORIZED', 'Not allowed.'),
    );

    const err = await revokeVaultDeviceSession({ sessionId: 'session-1' }).catch((e) => e);
    expect(err.code).toBe('UNAUTHORIZED');
    expect(err.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// changeAccountPassword
// ---------------------------------------------------------------------------

describe('changeAccountPassword', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('posts the current and new passwords to the change-password endpoint', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        makeOkResponse({ success: true, data: { message: 'Password changed.' } }),
      );

    await changeAccountPassword('OldPass123!', 'NewPass456!', CAPTCHA_TOKEN);

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/auth/change-password');
    const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string);
    expect(body.currentPassword).toBe('OldPass123!');
    expect(body.newPassword).toBe('NewPass456!');
  });

  it('throws on wrong-current-password error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      makeErrorResponse(401, 'INVALID_CREDENTIALS', 'Current password is incorrect.'),
    );

    const err = await changeAccountPassword('WrongOld!', 'NewPass456!', CAPTCHA_TOKEN).catch(
      (e) => e,
    );
    expect(err.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// getAuthenticatedProfile
// ---------------------------------------------------------------------------

describe('getAuthenticatedProfile', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('fetches the /me endpoint and returns profile data', async () => {
    const profile = {
      id: 'u1',
      username: 'alice',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      sessions: [],
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      makeOkResponse({ success: true, data: profile }),
    );

    const result = await getAuthenticatedProfile();
    expect(result.username).toBe('alice');
    expect(Array.isArray(result.sessions)).toBe(true);
  });

  it('throws when the profile fetch returns 401', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      makeErrorResponse(401, 'UNAUTHORIZED', 'Not authenticated.'),
    );

    const err = await getAuthenticatedProfile().catch((e) => e);
    expect(err.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// updateAuthenticatedProfile
// ---------------------------------------------------------------------------

describe('updateAuthenticatedProfile', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('posts profile values and returns the updated payload', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      makeOkResponse({
        success: true,
        data: {
          id: 'u1',
          username: 'alice',
          profileName: 'Alice',
          profilePhoto: 'https://example.com/avatar.png',
          updatedAt: '2026-04-29T00:00:00.000Z',
        },
      }),
    );

    const result = await updateAuthenticatedProfile({
      profileName: 'Alice',
      profilePhoto: 'https://example.com/avatar.png',
    });

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/auth/profile');
    const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string);
    expect(body.profileName).toBe('Alice');
    expect(body.profilePhoto).toBe('https://example.com/avatar.png');
    expect(result.profileName).toBe('Alice');
  });

  it('rejects malformed successful profile update responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      makeOkResponse({
        success: true,
        data: {
          id: 'u1',
          username: 'alice',
          updatedAt: '2026-04-29T00:00:00.000Z',
        },
      }),
    );

    const err = await updateAuthenticatedProfile({ profileName: 'A' }).catch((e) => e);
    expect(err.code).toBe('INVALID_AUTH_RESPONSE');
  });
});

import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.stubEnv('JWT_SECRET', 'test-jwt-secret');
vi.stubEnv('REFRESH_TOKEN_SECRET', 'test-refresh-secret');

type AuthServiceModule = typeof import('../../server/services/authService.ts');
type AuthUtilsModule = typeof import('../../server/utils/auth.ts');

let authService: AuthServiceModule;
let authUtils: AuthUtilsModule;

describe('issueUserSession', () => {
  beforeAll(async () => {
    authService = await import('../../server/services/authService.ts');
    authUtils = await import('../../server/utils/auth.ts');
  }, 60000);

  it('falls back to a safe device id when deviceId is missing', () => {
    const user = {
      _id: { toString: () => 'user-1' },
      username: 'alice',
      sessions: [],
    } as any;

    const session = authService.issueUserSession(user, {
      deviceId: undefined,
    });
    const decoded = authUtils.verifyRefreshToken(session.refreshToken);

    expect(user.sessions).toHaveLength(1);
    expect(user.sessions[0].deviceId).toBe('unknown-device');
    expect(decoded.deviceId).toBe('unknown-device');
  });

  it('falls back to a safe device id when deviceId is blank', () => {
    const user = {
      _id: { toString: () => 'user-1' },
      username: 'alice',
      sessions: [],
    } as any;

    const session = authService.issueUserSession(user, {
      deviceId: '   ',
    });
    const decoded = authUtils.verifyRefreshToken(session.refreshToken);

    expect(user.sessions).toHaveLength(1);
    expect(user.sessions[0].deviceId).toBe('unknown-device');
    expect(decoded.deviceId).toBe('unknown-device');
  });
});

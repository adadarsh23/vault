import { beforeEach, describe, expect, it, vi } from 'vitest';

const modelState = vi.hoisted(() => ({
  user: null as any,
}));

vi.mock('../../server/models/user.ts', () => ({
  User: {
    findById: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      exec: vi.fn(async () => modelState.user),
    })),
  },
}));

import {
  getAuthenticatedUserProfile,
  updateAuthenticatedUserProfile,
} from '../../server/services/accountSessionService.ts';

const buildMockUser = (overrides: Record<string, unknown> = {}) => {
  const now = new Date('2026-05-17T00:00:00.000Z');
  return {
    _id: 'user-1',
    username: 'alice',
    profileName: 'none',
    profilePhoto: 'none',
    profileDetails: {
      createdAt: now,
      updatedAt: now,
    },
    createdAt: now,
    updatedAt: now,
    sessions: [],
    loginHistory: [],
    meta: {
      activeDevices: [],
      lastLoginAt: null,
      lastSyncAt: null,
    },
    save: vi.fn(async () => undefined),
    ...overrides,
  };
};

describe('accountSessionService profile encryption', () => {
  beforeEach(() => {
    modelState.user = null;
  });

  it('encrypts profile name and photo before persisting', async () => {
    const user = buildMockUser();
    modelState.user = user;

    const result = await updateAuthenticatedUserProfile({
      userId: 'user-1',
      profileName: 'Alice',
      profilePhoto: 'https://example.com/avatar.png',
    });

    expect(user.save).toHaveBeenCalledTimes(1);
    expect(user.profileName).toMatch(/^enc:v1:/);
    expect(user.profilePhoto).toMatch(/^enc:v1:/);
    expect(user.profileName).not.toContain('Alice');
    expect(user.profilePhoto).not.toContain('example.com/avatar.png');

    expect(result.profileName).toBe('Alice');
    expect(result.profilePhoto).toBe('https://example.com/avatar.png');
  });

  it('decrypts encrypted profile values when reading profile', async () => {
    const user = buildMockUser();
    modelState.user = user;

    await updateAuthenticatedUserProfile({
      userId: 'user-1',
      profileName: 'Alice',
      profilePhoto: 'https://example.com/avatar.png',
    });

    const profile = await getAuthenticatedUserProfile('user-1');

    expect(profile.profileName).toBe('Alice');
    expect(profile.profilePhoto).toBe('https://example.com/avatar.png');
  });

  it('migrates legacy plaintext profile fields to encrypted storage on read', async () => {
    const user = buildMockUser({
      profileName: 'Legacy Name',
      profilePhoto: 'https://example.com/legacy.png',
    });
    modelState.user = user;

    const profile = await getAuthenticatedUserProfile('user-1');

    expect(user.save).toHaveBeenCalledTimes(1);
    expect(user.profileName).toMatch(/^enc:v1:/);
    expect(user.profilePhoto).toMatch(/^enc:v1:/);
    expect(profile.profileName).toBe('Legacy Name');
    expect(profile.profilePhoto).toBe('https://example.com/legacy.png');
  });

  it('converts base64 profile photo to GridFS avatar URL and avoids storing raw base64', async () => {
    const user = buildMockUser();
    modelState.user = user;

    // Small 1x1 transparent PNG base64
    const tinyBase64 =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

    const result = await updateAuthenticatedUserProfile({
      userId: 'user-1',
      profileName: 'Alice',
      profilePhoto: tinyBase64,
    });

    expect(user.save).toHaveBeenCalledTimes(1);
    expect(result.profilePhoto).toMatch(/^\/api\/avatar\/raw\/user-1\//);
    expect(result.profilePhoto).not.toContain('data:image');
    expect(user.profilePhoto).not.toContain('data:image');
  });
});

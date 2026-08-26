/* @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useVaultStore } from '../../../store/vaultStore';
import {
  getFailedUnlockAttempts,
  incrementFailedUnlockAttempts,
  resetFailedUnlockAttempts,
  FAILED_ATTEMPTS_STORAGE_KEY,
} from '../../auth/useVaultAuth';
import * as storage from '../../../lib/storage';
import * as authSession from '../../../lib/auth-session';
import * as cryptoPrimitives from '../../../lib/cryptoPrimitives';
import * as blobRegistry from '../../../lib/blobRegistry';
import * as sync from '../../../lib/sync';

// Mock dependencies
vi.mock('../../../lib/storage', async () => {
  const actual =
    await vi.importActual<typeof import('../../../lib/storage')>('../../../lib/storage');
  return {
    ...actual,
    clearVault: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('../../../lib/auth-session', async () => {
  const actual = await vi.importActual<typeof import('../../../lib/auth-session')>(
    '../../../lib/auth-session',
  );
  return {
    ...actual,
    clearAuthToken: vi.fn(),
    clearCloudSessionHint: vi.fn(),
    clearRememberedVaultAccess: vi.fn(),
    getDeviceId: vi.fn(() => 'test-device-id'),
  };
});

vi.mock('../../../lib/cryptoPrimitives', async () => {
  const actual = await vi.importActual<typeof import('../../../lib/cryptoPrimitives')>(
    '../../../lib/cryptoPrimitives',
  );
  return {
    ...actual,
    clearCryptoKeyCache: vi.fn(),
  };
});

vi.mock('../../../lib/blobRegistry', async () => {
  const actual = await vi.importActual<typeof import('../../../lib/blobRegistry')>(
    '../../../lib/blobRegistry',
  );
  return {
    ...actual,
    revokeAllActiveBlobUrls: vi.fn(),
  };
});

vi.mock('../../../lib/sync', async () => {
  const actual = await vi.importActual<typeof import('../../../lib/sync')>('../../../lib/sync');
  return {
    ...actual,
    deleteItemFromCloud: vi.fn().mockResolvedValue(undefined),
    downloadAllFromCloud: vi.fn().mockResolvedValue([]),
    uploadLogsToCloud: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

describe("🚨 Emergency Self-Destruct / Brute-Force Wipe (Dead Man's Switch)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    resetFailedUnlockAttempts();

    useVaultStore.setState({
      isUnlocked: true,
      isVaultReady: true,
      masterKey: {} as any,
      items: [
        {
          id: 'item-1',
          type: 'password',
          title: 'Secret Note',
          content: 'super-secret',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      preferences: {
        ...useVaultStore.getState().preferences,
        isBruteForceWipeEnabled: true,
        maxFailedAttemptsBeforeWipe: 10,
      },
    });
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  describe('🔹 1. Failed Attempts Tracker Helpers', () => {
    it('starts at 0 failed attempts', () => {
      expect(getFailedUnlockAttempts()).toBe(0);
    });

    it('increments failed attempts persistently in localStorage', () => {
      expect(incrementFailedUnlockAttempts()).toBe(1);
      expect(getFailedUnlockAttempts()).toBe(1);
      expect(localStorage.getItem(FAILED_ATTEMPTS_STORAGE_KEY)).toBe('1');

      expect(incrementFailedUnlockAttempts()).toBe(2);
      expect(getFailedUnlockAttempts()).toBe(2);
    });

    it('resets failed attempts to 0 when resetFailedUnlockAttempts is called', () => {
      incrementFailedUnlockAttempts();
      incrementFailedUnlockAttempts();
      incrementFailedUnlockAttempts();
      expect(getFailedUnlockAttempts()).toBe(3);

      resetFailedUnlockAttempts();
      expect(getFailedUnlockAttempts()).toBe(0);
      expect(localStorage.getItem(FAILED_ATTEMPTS_STORAGE_KEY)).toBeNull();
    });
  });

  describe('🔹 2. emergencyLocalWipe Execution & Cloud Data Safety', () => {
    it('purges all local cryptographic keys, tokens, and IndexedDB without deleting cloud data', async () => {
      const deleteCloudSpy = vi.spyOn(sync, 'deleteItemFromCloud');

      await useVaultStore.getState().emergencyLocalWipe();

      // 1. In-memory keys & cache cleared
      expect(cryptoPrimitives.clearCryptoKeyCache).toHaveBeenCalled();
      expect(blobRegistry.revokeAllActiveBlobUrls).toHaveBeenCalled();

      // 2. Local storage & IndexedDB shredded
      expect(storage.clearVault).toHaveBeenCalled();

      // 3. Auth tokens & session hints cleared
      expect(authSession.clearAuthToken).toHaveBeenCalled();
      expect(authSession.clearCloudSessionHint).toHaveBeenCalled();
      expect(authSession.clearRememberedVaultAccess).toHaveBeenCalled();

      // 4. Store state reset to locked & empty
      const state = useVaultStore.getState();
      expect(state.isUnlocked).toBe(false);
      expect(state.isVaultReady).toBe(false);
      expect(state.masterKey).toBeNull();
      expect(state.items).toEqual([]);

      // 5. 🛡️ CLOUD SAFETY CHECK: No cloud delete APIs should EVER be called!
      expect(deleteCloudSpy).not.toHaveBeenCalled();
    });
  });

  describe('🔹 3. Brute-Force Threshold Triggering in Store Settings', () => {
    it('allows configuring maxFailedAttemptsBeforeWipe (e.g. 3, 5, 10, 15)', () => {
      useVaultStore.getState().updatePreferences({ maxFailedAttemptsBeforeWipe: 5 });
      expect(useVaultStore.getState().preferences.maxFailedAttemptsBeforeWipe).toBe(5);

      useVaultStore.getState().updatePreferences({ maxFailedAttemptsBeforeWipe: 15 });
      expect(useVaultStore.getState().preferences.maxFailedAttemptsBeforeWipe).toBe(15);
    });

    it('allows toggling isBruteForceWipeEnabled', () => {
      useVaultStore.getState().updatePreferences({ isBruteForceWipeEnabled: false });
      expect(useVaultStore.getState().preferences.isBruteForceWipeEnabled).toBe(false);

      useVaultStore.getState().updatePreferences({ isBruteForceWipeEnabled: true });
      expect(useVaultStore.getState().preferences.isBruteForceWipeEnabled).toBe(true);
    });
  });
});

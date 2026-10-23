import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  VaultService,
  VaultServiceError,
  type ExportedRsaKeys,
} from '../../src/services/vaultService';
import { deriveKey, encryptData, encryptFile } from '../../src/lib/cryptoPrimitives';
import type { VaultItem } from '../../src/lib/storage';

// Mock storage and sync dependencies
vi.mock('../../src/lib/storage', async () => {
  const actual =
    await vi.importActual<typeof import('../../src/lib/storage')>('../../src/lib/storage');
  return {
    ...actual,
    saveItem: vi.fn().mockResolvedValue(undefined),
    deleteItem: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('../../src/lib/sync', async () => {
  const actual = await vi.importActual<typeof import('../../src/lib/sync')>('../../src/lib/sync');
  return {
    ...actual,
    uploadItemToCloud: vi.fn().mockResolvedValue(undefined),
    uploadSettingsToCloud: vi.fn().mockResolvedValue(undefined),
    deleteItemFromCloud: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('../../src/lib/auth-api', () => ({
  fetchVaultSalt: vi.fn().mockResolvedValue('test-user-vault-pqc-salt'),
}));

describe('VaultService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('VaultServiceError', () => {
    it('constructs with code, cause, and context', () => {
      const cause = new Error('Low level error');
      const error = new VaultServiceError('Failed to rotate', 'ROTATION_ITEM_FAILED', cause, {
        completedCount: 5,
        totalCount: 10,
      });

      expect(error.name).toBe('VaultServiceError');
      expect(error.message).toBe('Failed to rotate');
      expect(error.code).toBe('ROTATION_ITEM_FAILED');
      expect(error.cause).toBe(cause);
      expect(error.completedCount).toBe(5);
      expect(error.totalCount).toBe(10);
      expect(error instanceof Error).toBe(true);
      expect(error instanceof VaultServiceError).toBe(true);
    });
  });

  describe('rotateMasterKey', () => {
    it('validates input parameters', async () => {
      await expect(
        VaultService.rotateMasterKey(null as any, 'oldKey', 'newKey', 'alice'),
      ).rejects.toMatchObject({
        code: 'INVALID_ARGUMENT',
      });

      await expect(VaultService.rotateMasterKey([], '', 'newKey', 'alice')).rejects.toMatchObject({
        code: 'INVALID_ARGUMENT',
      });

      await expect(
        VaultService.rotateMasterKey([], 'oldKey', '   ', 'alice'),
      ).rejects.toMatchObject({
        code: 'INVALID_ARGUMENT',
      });

      await expect(VaultService.rotateMasterKey([], 'oldKey', 'newKey', '')).rejects.toMatchObject({
        code: 'INVALID_ARGUMENT',
      });
    });

    it('throws IDENTICAL_KEY when new password resolves to old master key', async () => {
      const password = 'Password123!';
      const salt = 'test-user-vault-pqc-salt';
      const derivedKey = await deriveKey(password, salt);

      await expect(
        VaultService.rotateMasterKey([], derivedKey, password, 'test-user'),
      ).rejects.toMatchObject({
        code: 'IDENTICAL_KEY',
      });
    });

    it('handles empty items array gracefully', async () => {
      const oldKey = await deriveKey('OldPass123!', 'test-user-vault-pqc-salt');
      const onProgress = vi.fn();

      const result = await VaultService.rotateMasterKey(
        [],
        oldKey,
        'NewPass123!',
        'test-user',
        onProgress,
      );

      expect(result.updatedItems).toEqual([]);
      expect(typeof result.resolvedNewKey).toBe('string');
      expect(onProgress).toHaveBeenCalledWith(0, 0);
    });

    it('re-encrypts string and binary items and uploads them to cloud', async () => {
      const oldKey = await deriveKey('OldPass123!', 'test-user-vault-pqc-salt');
      const newKey = 'NewPass123!';
      const salt = 'test-user-vault-pqc-salt';
      const expectedNewKey = await deriveKey(newKey, salt);

      const encryptedText = await encryptData('secret password note', oldKey);
      const binaryPayload = new Uint8Array([1, 2, 3, 4, 5]);
      const file = new File([binaryPayload], 'test.bin', { type: 'application/octet-stream' });
      const encryptedFile = await encryptFile(file, oldKey);

      const items: VaultItem[] = [
        {
          id: 'item-1',
          type: 'password',
          title: 'My Bank Note',
          content: encryptedText,
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          id: 'item-2',
          type: 'file',
          title: 'My Document',
          content: encryptedFile,
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          id: 'item-3',
          type: 'file',
          title: 'Cloud Doc',
          content: 'cloud://bucket/item-3',
          createdAt: 1000,
          updatedAt: 1000,
        },
      ];

      const progressUpdates: Array<[number, number]> = [];
      const onProgress = (done: number, total: number) => {
        progressUpdates.push([done, total]);
      };

      const result = await VaultService.rotateMasterKey(
        items,
        oldKey,
        newKey,
        'test-user',
        onProgress,
      );

      expect(result.resolvedNewKey).toBe(expectedNewKey);
      expect(result.updatedItems).toHaveLength(3);
      expect(result.updatedItems[0].content).not.toBe(encryptedText);
      expect(result.updatedItems[1].content).not.toBe(encryptedFile);
      expect(result.updatedItems[2].content).toBe('cloud://bucket/item-3'); // server ref preserved

      expect(progressUpdates[0]).toEqual([0, 3]);
      expect(progressUpdates).toContainEqual([3, 3]);
    });

    it('deduplicates items preserving binary payload over remote placeholder string', async () => {
      const oldKey = await deriveKey('OldPass123!', 'test-user-vault-pqc-salt');
      const binaryContent = new Uint8Array([10, 20, 30, 40]);
      const file = new File([binaryContent], 'data.bin');
      const encryptedBinary = await encryptFile(file, oldKey);

      const items: VaultItem[] = [
        {
          id: 'same-id',
          type: 'file',
          title: 'Binary Item',
          content: encryptedBinary,
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          id: 'same-id',
          type: 'file',
          title: 'Remote Pointer Placeholder',
          content: 'cloud://item-placeholder',
          createdAt: 1000,
          updatedAt: 2000, // Newer updatedAt but only string content
        },
      ];

      const result = await VaultService.rotateMasterKey(items, oldKey, 'NewPass123!', 'test-user');
      expect(result.updatedItems).toHaveLength(1);
      // The binary payload should be preserved and rotated to Uint8Array
      expect(result.updatedItems[0].content).toBeInstanceOf(Uint8Array);
    });

    it('aborts cleanly when AbortSignal is signaled', async () => {
      const oldKey = await deriveKey('OldPass123!', 'test-user-vault-pqc-salt');
      const controller = new AbortController();
      controller.abort();

      await expect(
        VaultService.rotateMasterKey([], oldKey, 'NewPass123!', 'test-user', {
          signal: controller.signal,
        }),
      ).rejects.toMatchObject({
        code: 'ROTATION_FAILED',
      });
    });
  });

  describe('syncSettings', () => {
    it('validates master key argument', async () => {
      await expect(VaultService.syncSettings('', {}, false)).rejects.toMatchObject({
        code: 'INVALID_ARGUMENT',
      });
    });

    it('uploads normalized settings payload to cloud', async () => {
      const { uploadSettingsToCloud } = await import('../../src/lib/sync');
      const rsaKeys: ExportedRsaKeys = {
        publicKey: 'pub-key-pem',
        privateKey: 'priv-key-pem',
      };

      await VaultService.syncSettings('validMasterKey', { isAutoLockEnabled: true }, true, rsaKeys);

      expect(uploadSettingsToCloud).toHaveBeenCalledWith(
        {
          preferences: { isAutoLockEnabled: true },
          allowRestrictedTypes: true,
          rsaKeys: { publicKey: 'pub-key-pem', privateKey: 'priv-key-pem' },
        },
        'validMasterKey',
        { force: true },
      );
    });
  });

  describe('saveItems and saveItem', () => {
    it('validates key and items arguments', async () => {
      await expect(VaultService.saveItems('', [], { syncCloud: true })).rejects.toMatchObject({
        code: 'INVALID_ARGUMENT',
      });

      await expect(VaultService.saveItems('key', null as any)).rejects.toMatchObject({
        code: 'INVALID_ARGUMENT',
      });
    });

    it('persists items locally and syncs to cloud if requested', async () => {
      const { saveItem } = await import('../../src/lib/storage');
      const { uploadItemToCloud } = await import('../../src/lib/sync');

      const items: VaultItem[] = [
        {
          id: 'test-1',
          type: 'note',
          title: 'Note 1',
          content: 'content 1',
          createdAt: 1000,
          updatedAt: 1000,
        },
      ];

      await VaultService.saveItems('test-key', items, { syncCloud: true });

      expect(saveItem).toHaveBeenCalledWith(items[0]);
      expect(uploadItemToCloud).toHaveBeenCalledWith(items[0], 'test-key');
    });

    it('saveItem wraps saveItems for a single item', async () => {
      const { saveItem } = await import('../../src/lib/storage');

      const item: VaultItem = {
        id: 'single-1',
        type: 'password',
        title: 'Single Item',
        content: 'secret',
        createdAt: 1000,
        updatedAt: 1000,
      };

      await VaultService.saveItem('test-key', item);
      expect(saveItem).toHaveBeenCalledWith(item);
    });
  });

  describe('deleteItem', () => {
    it('deletes from local storage and cloud', async () => {
      const { deleteItem } = await import('../../src/lib/storage');
      const { deleteItemFromCloud } = await import('../../src/lib/sync');

      await VaultService.deleteItem('key', 'item-to-delete', { syncCloud: true });

      expect(deleteItem).toHaveBeenCalledWith('item-to-delete');
      expect(deleteItemFromCloud).toHaveBeenCalledWith('item-to-delete', 'key');
    });
  });

  describe('purgeDeletedItems', () => {
    it('deletes trash items and retains active items', async () => {
      const { deleteItem } = await import('../../src/lib/storage');
      const { deleteItemFromCloud } = await import('../../src/lib/sync');

      const items: VaultItem[] = [
        {
          id: 'active-1',
          type: 'note',
          title: 'Active Note',
          content: 'active',
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          id: 'deleted-1',
          type: 'note',
          title: 'Deleted Note',
          content: 'trash',
          createdAt: 1000,
          updatedAt: 1000,
          deletedAt: 1500,
        },
      ];

      const result = await VaultService.purgeDeletedItems('key', items, { syncCloud: true });

      expect(result.purgedCount).toBe(1);
      expect(result.activeItems).toHaveLength(1);
      expect(result.activeItems[0].id).toBe('active-1');
      expect(deleteItem).toHaveBeenCalledWith('deleted-1');
      expect(deleteItemFromCloud).toHaveBeenCalledWith('deleted-1', 'key');
    });
  });
});

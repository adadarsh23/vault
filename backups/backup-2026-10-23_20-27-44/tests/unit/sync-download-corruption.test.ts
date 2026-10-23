import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAuthToken, setAuthToken } from '../../src/lib/auth-session.ts';
import { deriveKey, encryptData } from '../../src/lib/cryptoPrimitives.ts';
import { logger } from '../../src/lib/logger.ts';
import { downloadVaultSnapshotFromCloud } from '../../src/lib/sync.ts';

const makeOkResponse = (body: unknown, status = 200): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    headers: new Headers(),
  }) as Response;

describe('downloadVaultSnapshotFromCloud corruption tolerance', () => {
  beforeEach(() => {
    setAuthToken('sync-download-token');
  });

  afterEach(() => {
    clearAuthToken();
    vi.restoreAllMocks();
  });

  it('skips malformed binary payloads and keeps valid items', async () => {
    const masterKey = await deriveKey('VaultKey123!', 'sync-download-corruption-test-salt');
    const encryptedMetadata = await encryptData(
      JSON.stringify({
        id: 'valid-note-1',
        type: 'note',
        title: 'Recovered note',
        metadata: {},
        folder: null,
        createdAt: 1700000000000,
        updatedAt: 1700000000000,
      }),
      masterKey,
    );

    const warnSpy = vi.spyOn(logger, 'warn');
    const errorSpy = vi.spyOn(logger, 'error');

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      makeOkResponse({
        data: [
          {
            itemId: 'bad-binary-1',
            category: 'file',
            encoding: 'binary-base64',
            payload: '%%%not-base64%%%',
          },
          {
            itemId: 'valid-note-1',
            category: 'note',
            payload: `V2_MODERN:${encryptedMetadata}|hello from cloud`,
          },
        ],
      }),
    );

    const snapshot = await downloadVaultSnapshotFromCloud(masterKey);

    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.items[0]?.id).toBe('valid-note-1');
    expect(snapshot.items[0]?.content).toBe('hello from cloud');

    expect(
      (warnSpy.mock.calls as any[]).some(
        ([message]: any[]) => message === 'Cloud sync skipped corrupted item(s)',
      ),
    ).toBe(true);
    expect(
      (errorSpy.mock.calls as any[]).some(
        ([message]: any[]) => message === 'Error in Partial Sync Failure',
      ),
    ).toBe(false);
  });

  it('skips item with un-decryptable metadata and keeps valid items when master key is correct', async () => {
    const masterKey = await deriveKey('VaultKey123!', 'sync-download-corruption-test-salt');
    const encryptedMetadata = await encryptData(
      JSON.stringify({
        id: 'valid-note-2',
        type: 'note',
        title: 'Valid note',
        metadata: {},
        folder: null,
        createdAt: 1700000000000,
        updatedAt: 1700000000000,
      }),
      masterKey,
    );

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      makeOkResponse({
        data: [
          {
            itemId: 'corrupted-meta-item',
            category: 'note',
            payload: `V2_MODERN:invalid-encrypted-metadata-string|corrupted content`,
          },
          {
            itemId: 'valid-note-2',
            category: 'note',
            payload: `V2_MODERN:${encryptedMetadata}|valid cloud content`,
          },
        ],
      }),
    );

    const snapshot = await downloadVaultSnapshotFromCloud(masterKey);

    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.items[0]?.id).toBe('valid-note-2');
    expect(snapshot.items[0]?.content).toBe('valid cloud content');
  });

  it('throws vault mismatch error when ALL modern items fail metadata decryption', async () => {
    const masterKey = await deriveKey('VaultKey123!', 'sync-download-corruption-test-salt');

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      makeOkResponse({
        data: [
          {
            itemId: 'wrong-key-item-1',
            category: 'note',
            payload: `V2_MODERN:invalid-encrypted-metadata-string|content`,
          },
        ],
      }),
    );

    await expect(downloadVaultSnapshotFromCloud(masterKey)).rejects.toThrow(
      'This cloud vault does not match the currently unlocked master Key.',
    );
  });

  it('recovers valid items when keycheck sentinel is valid despite corrupted metadata items', async () => {
    const { createVaultKeyCheckPayload } = await import('../../src/lib/vaultKeyCheck.ts');
    const masterKey = await deriveKey('VaultKey123!', 'sync-download-corruption-test-salt');
    const keyCheckPayload = await createVaultKeyCheckPayload(masterKey);
    const encryptedMetadata = await encryptData(
      JSON.stringify({
        id: 'valid-note-3',
        type: 'note',
        title: 'Valid note 3',
        metadata: {},
        folder: null,
        createdAt: 1700000000000,
        updatedAt: 1700000000000,
      }),
      masterKey,
    );

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      makeOkResponse({
        data: [
          {
            itemId: '__keycheck__',
            category: 'system',
            payload: keyCheckPayload,
          },
          {
            itemId: 'corrupted-meta-item-3',
            category: 'note',
            payload: `V2_MODERN:invalid-encrypted-metadata-string|corrupted content`,
          },
          {
            itemId: 'valid-note-3',
            category: 'note',
            payload: `V2_MODERN:${encryptedMetadata}|valid cloud content 3`,
          },
        ],
      }),
    );

    const snapshot = await downloadVaultSnapshotFromCloud(masterKey);

    expect(snapshot.hasKeyCheck).toBe(true);
    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.items[0]?.id).toBe('valid-note-3');
    expect(snapshot.items[0]?.content).toBe('valid cloud content 3');
  });
});

import { describe, expect, it } from 'vitest';
import { parseLegacyPayloadFromRequest } from '../../server/controllers/legacyVaultController.ts';

describe('parseLegacyPayloadFromRequest', () => {
  it('uses encrypted headers as the source of truth for modern payloads', async () => {
    const req = {
      headers: {
        'x-vault-title': 'V2_ENC:encrypted-title-bundle',
        'x-vault-metadata': 'V2_ENC:encrypted-metadata-bundle',
      },
      body: {
        payload: 'V2_MODERN:encrypted-meta|encrypted-content',
        category: 'todo',
        title: 'plain-text-title-should-not-be-stored',
        folder: 'Personal',
        metadata: {
          leak: true,
        },
        username: 'alice',
        id: 'todo-1',
      },
    } as any;

    const parsed = await parseLegacyPayloadFromRequest(req, {} as any);

    expect(parsed).not.toBeNull();
    expect(parsed?.category).toBe('todo');
    expect(parsed?.title).toBe('V2_ENC:encrypted-title-bundle');
    expect(parsed?.folder).toBeNull();
    expect(parsed?.metadata).toEqual({
      payload: 'V2_ENC:encrypted-metadata-bundle',
    });
  });

  it('preserves plaintext legacy payload fields when encrypted headers are absent', async () => {
    const req = {
      headers: {},
      body: {
        payload: 'legacy-ciphertext',
        category: 'todo',
        title: 'Legacy Todo Title',
        folder: 'Work',
        metadata: {
          custom: 'value',
        },
        username: 'alice',
        id: 'todo-2',
      },
    } as any;

    const parsed = await parseLegacyPayloadFromRequest(req, {} as any);

    expect(parsed?.folder).toBe('Work');
    expect(parsed?.metadata).toMatchObject({
      custom: 'value',
      username: 'alice',
      id: 'todo-2',
    });
  });

  it('extracts folder from x-vault-folder header when encrypted headers are present', async () => {
    const req = {
      headers: {
        'x-vault-title': 'V2_ENC:encrypted-title-bundle',
        'x-vault-metadata': 'V2_ENC:encrypted-metadata-bundle',
        'x-vault-folder': 'Saved%20videos',
      },
      body: {
        payload: 'V2_MODERN:encrypted-meta|',
        category: 'video',
      },
    } as any;

    const parsed = await parseLegacyPayloadFromRequest(req, {} as any);

    expect(parsed).not.toBeNull();
    expect(parsed?.category).toBe('video');
    expect(parsed?.folder).toBe('Saved videos');
    expect(parsed?.title).toBe('V2_ENC:encrypted-title-bundle');
  });
});

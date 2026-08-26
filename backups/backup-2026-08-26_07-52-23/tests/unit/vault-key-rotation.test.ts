import { describe, expect, it } from 'vitest';
import { deriveKey, encryptData, encryptFile } from '../../src/lib/cryptoPrimitives.ts';
import { reencryptVaultItemContent } from '../../src/lib/vaultKeyRotation.ts';

describe('vaultKeyRotation', () => {
  it('rotates encrypted string content to the new key', async () => {
    const oldKey = await deriveKey('OldVault123!', 'alice-vault-pqc-salt');
    const newKey = await deriveKey('NewVault123!', 'alice-vault-pqc-salt');
    const encrypted = await encryptData('secret note', oldKey);

    const rotated = await reencryptVaultItemContent(
      { title: 'Note', content: encrypted },
      oldKey,
      newKey,
    );

    expect(typeof rotated).toBe('string');
    expect(rotated).not.toBe(encrypted);
  });

  it('preserves non-base64 plaintext string content', async () => {
    const oldKey = await deriveKey('OldVault123!', 'alice-vault-pqc-salt');
    const newKey = await deriveKey('NewVault123!', 'alice-vault-pqc-salt');
    const plaintext = 'Bring milk and eggs';

    const rotated = await reencryptVaultItemContent(
      { title: 'Todo', content: plaintext },
      oldKey,
      newKey,
    );

    expect(rotated).toBe(plaintext);
  });

  it('preserves server reference string content', async () => {
    const oldKey = await deriveKey('OldVault123!', 'alice-vault-pqc-salt');
    const newKey = await deriveKey('NewVault123!', 'alice-vault-pqc-salt');
    const serverRef = '/api/vault/files/abc123';

    const rotated = await reencryptVaultItemContent(
      { title: 'Video', content: serverRef },
      oldKey,
      newKey,
    );

    expect(rotated).toBe(serverRef);
  });

  it('returns original content when both keys are identical', async () => {
    const key = await deriveKey('SameVault123!', 'alice-vault-pqc-salt');
    const file = new File([new Uint8Array([1, 2, 3])], 'demo.bin');
    const encryptedBytes = await encryptFile(file, key);

    const rotated = await reencryptVaultItemContent(
      { title: 'Binary', content: encryptedBytes },
      key,
      key,
    );

    expect(rotated).toBe(encryptedBytes);
  });

  it('throws a typed key-material error when key is invalid', async () => {
    const validOldKey = await deriveKey('OldVault123!', 'alice-vault-pqc-salt');
    const encrypted = await encryptData('secret', validOldKey);

    await expect(
      reencryptVaultItemContent(
        { title: 'Note', content: encrypted },
        'not-a-valid-derived-key',
        'still-not-valid',
      ),
    ).rejects.toMatchObject({
      code: 'INVALID_KEY_MATERIAL',
    });
  });
});

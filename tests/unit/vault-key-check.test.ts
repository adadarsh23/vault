import { describe, expect, it } from 'vitest';
import { deriveKey, encryptData } from '../../src/lib/cryptoPrimitives.ts';
import {
  createVaultKeyCheckPayload,
  validateVaultKeyCheckPayload,
} from '../../src/lib/vaultKeyCheck.ts';

describe('vaultKeyCheck', () => {
  it('creates and validates a payload with the same key', async () => {
    const key = await deriveKey('VaultKey123!', 'alice-vault-pqc-salt');
    const payload = await createVaultKeyCheckPayload(key);

    await expect(validateVaultKeyCheckPayload(payload, key)).resolves.toBe(true);
  });

  it('rejects payload validation with a wrong key', async () => {
    const key = await deriveKey('VaultKey123!', 'alice-vault-pqc-salt');
    const wrongKey = await deriveKey('WrongKey123!', 'alice-vault-pqc-salt');
    const payload = await createVaultKeyCheckPayload(key);

    await expect(validateVaultKeyCheckPayload(payload, wrongKey)).resolves.toBe(false);
  });

  it('trims payload and key whitespace during validation', async () => {
    const key = await deriveKey('VaultKey123!', 'alice-vault-pqc-salt');
    const payload = await createVaultKeyCheckPayload(key);

    await expect(validateVaultKeyCheckPayload(`  ${payload}  `, `  ${key}  `)).resolves.toBe(true);
  });

  it('rejects payload with invalid createdAt shape', async () => {
    const key = await deriveKey('VaultKey123!', 'alice-vault-pqc-salt');
    const malformedPayload = await encryptData(
      JSON.stringify({
        purpose: 'vault-key-check',
        version: 1,
        createdAt: 'not-a-date',
      }),
      key,
    );

    await expect(validateVaultKeyCheckPayload(malformedPayload, key)).resolves.toBe(false);
  });

  it('rejects payload with a far-future createdAt timestamp', async () => {
    const key = await deriveKey('VaultKey123!', 'alice-vault-pqc-salt');
    const future = new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString();
    const malformedPayload = await encryptData(
      JSON.stringify({
        purpose: 'vault-key-check',
        version: 1,
        createdAt: future,
      }),
      key,
    );

    await expect(validateVaultKeyCheckPayload(malformedPayload, key)).resolves.toBe(false);
  });

  it('throws typed error when creating payload with an empty master key', async () => {
    await expect(createVaultKeyCheckPayload('   ')).rejects.toMatchObject({
      code: 'INVALID_MASTER_KEY',
    });
  });
});

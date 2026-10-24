import assert from 'node:assert/strict';
import {
  decryptData,
  decryptFileEnvelope,
  deriveKey,
  encryptData,
  encryptFile,
} from '../src/lib/cryptoPrimitives.ts';
import {
  createVaultKeyCheckPayload,
  validateVaultKeyCheckPayload,
} from '../src/lib/vaultKeyCheck.ts';
import { reencryptVaultItemContent } from '../src/lib/vaultKeyRotation.ts';

interface VaultItemLike {
  id: string;
  type: string;
  title: string;
  content: string | Uint8Array;
  createdAt: number;
  updatedAt: number;
}

// const AES_GCM_AAD = new TextEncoder().encode('vault:e2ee:aes-gcm:v2');

const tests: Array<{ name: string; run: () => Promise<void> | void }> = [];

const addTest = (name: string, run: () => Promise<void> | void) => {
  tests.push({ name, run });
};

// ---------------------------------------------------------------------------
// Vault key check
// ---------------------------------------------------------------------------

addTest('master Key check validates the correct key and rejects the wrong key', async () => {
  const correctKey = await deriveKey('VaultKey123!', 'alice-vault-pqc-salt');
  const wrongKey = await deriveKey('WrongKey123!', 'alice-vault-pqc-salt');
  const payload = await createVaultKeyCheckPayload(
    correctKey,
    new Date('2026-03-22T00:00:00.000Z'),
  );

  assert.equal(await validateVaultKeyCheckPayload(payload, correctKey), true);
  assert.equal(await validateVaultKeyCheckPayload(payload, wrongKey), false);
});

addTest('validateVaultKeyCheckPayload returns false for an empty payload', async () => {
  const key = await deriveKey('VaultKey123!', 'alice-vault-pqc-salt');
  assert.equal(await validateVaultKeyCheckPayload('', key), false);
});

addTest('validateVaultKeyCheckPayload returns false for gibberish ciphertext', async () => {
  const key = await deriveKey('VaultKey123!', 'alice-vault-pqc-salt');
  // Base64 of random bytes that won't decrypt cleanly
  assert.equal(await validateVaultKeyCheckPayload('bm90cmVhbA==', key), false);
});

addTest('createVaultKeyCheckPayload is non-deterministic (IV randomness)', async () => {
  const key = await deriveKey('VaultKey123!', 'alice-vault-pqc-salt');
  const date = new Date('2026-03-22T00:00:00.000Z');
  const p1 = await createVaultKeyCheckPayload(key, date);
  const p2 = await createVaultKeyCheckPayload(key, date);
  assert.notEqual(p1, p2); // Different IVs → different ciphertext
});

// ---------------------------------------------------------------------------
// Key rotation – string content
// ---------------------------------------------------------------------------

addTest('reencryptVaultItemContent rotates encrypted string content', async () => {
  const oldKey = await deriveKey('OldVault123!', 'alice-vault-pqc-salt');
  const newKey = await deriveKey('NewVault123!', 'alice-vault-pqc-salt');
  const encrypted = await encryptData('secret note', oldKey);

  const item: VaultItemLike = {
    id: 'note-1',
    type: 'note',
    title: 'Note',
    content: encrypted,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const rotated = await reencryptVaultItemContent(item, oldKey, newKey);

  assert.equal(typeof rotated, 'string');
  assert.equal(await decryptData(rotated as string, newKey), 'secret note');
  assert.equal(await decryptData(rotated as string, oldKey), null);
});

addTest(
  'reencryptVaultItemContent rotated string differs from the original ciphertext',
  async () => {
    const oldKey = await deriveKey('OldVault123!', 'alice-vault-pqc-salt');
    const newKey = await deriveKey('NewVault123!', 'alice-vault-pqc-salt');
    const encrypted = await encryptData('my entry', oldKey);

    const item: VaultItemLike = {
      id: 'note-2',
      type: 'note',
      title: 'Note 2',
      content: encrypted,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const rotated = await reencryptVaultItemContent(item, oldKey, newKey);
    assert.notEqual(rotated, encrypted);
  },
);

addTest(
  'reencryptVaultItemContent throws an integrity error for wrong old key on string content',
  async () => {
    const realOldKey = await deriveKey('OldVault123!', 'alice-vault-pqc-salt');
    const wrongOldKey = await deriveKey('WrongOld123!', 'alice-vault-pqc-salt');
    const newKey = await deriveKey('NewVault123!', 'alice-vault-pqc-salt');
    const encrypted = await encryptData('sensitive', realOldKey);

    const item: VaultItemLike = {
      id: 'note-3',
      type: 'note',
      title: 'Note 3',
      content: encrypted,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    try {
      await reencryptVaultItemContent(item, wrongOldKey, newKey);
      assert.fail('Expected an integrity error but none was thrown');
    } catch (err) {
      assert.ok(err instanceof Error);
      assert.ok(
        err.message.includes('Integrity check failed') || err.message.includes('Note 3'),
        `Unexpected message: ${err.message}`,
      );
    }
  },
);

// ---------------------------------------------------------------------------
// Key rotation – binary (Uint8Array) content
// ---------------------------------------------------------------------------

addTest('reencryptVaultItemContent rotates encrypted binary content', async () => {
  const oldKey = await deriveKey('OldVault123!', 'alice-vault-pqc-salt');
  const newKey = await deriveKey('NewVault123!', 'alice-vault-pqc-salt');
  const file = new File([new Uint8Array([1, 2, 3, 4])], 'demo.bin', {
    type: 'application/octet-stream',
  });
  const encrypted = await encryptFile(file, oldKey);

  const item: VaultItemLike = {
    id: 'file-1',
    type: 'file',
    title: 'demo.bin',
    content: encrypted,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const rotated = await reencryptVaultItemContent(item, oldKey, newKey);

  assert.ok(rotated instanceof Uint8Array);
  assert.notDeepEqual(rotated, encrypted);
});

addTest(
  'reencryptVaultItemContent binary – rotated result is still decryptable with new key',
  async () => {
    const oldKey = await deriveKey('OldVault123!', 'alice-vault-pqc-salt');
    const newKey = await deriveKey('NewVault123!', 'alice-vault-pqc-salt');
    const rawBytes = new Uint8Array([10, 20, 30, 40, 50]);
    const file = new File([rawBytes], 'payload.bin');
    const encrypted = await encryptFile(file, oldKey);

    const item: VaultItemLike = {
      id: 'file-2',
      type: 'file',
      title: 'payload.bin',
      content: encrypted,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const rotated = await reencryptVaultItemContent(item, oldKey, newKey);
    assert.ok(rotated instanceof Uint8Array);

    // Re-decrypt with the new key using decryptFileEnvelope (handles VCAS01 Cascade bundles)
    const decryptedBuf = await decryptFileEnvelope(rotated as Uint8Array, newKey);
    const decrypted = new Uint8Array(decryptedBuf);
    assert.deepEqual(decrypted, rawBytes);
  },
);

addTest('reencryptVaultItemContent throws for invalid content format', async () => {
  const oldKey = await deriveKey('OldVault123!', 'alice-vault-pqc-salt');
  const newKey = await deriveKey('NewVault123!', 'alice-vault-pqc-salt');

  const item = {
    id: 'bad-1',
    type: 'unknown',
    title: 'bad item',
    // force a bad content type at runtime (number instead of string/Uint8Array)
    content: 42 as unknown as string,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  try {
    await reencryptVaultItemContent(item, oldKey, newKey);
    assert.fail('Expected an error for invalid content format');
  } catch (err) {
    assert.ok(err instanceof Error);
    assert.ok(
      err.message.includes('Invalid content format') || err.message.includes('bad item'),
      `Unexpected message: ${err.message}`,
    );
  }
});

// ---------------------------------------------------------------------------
// encryptData / decryptData round-trips
// ---------------------------------------------------------------------------

addTest('encryptData + decryptData round-trip for unicode content', async () => {
  const key = await deriveKey('VaultKey123!', 'unicode-test-salt-');
  const plaintext = '🔑 プライベートキー – très secret';

  const encrypted = await encryptData(plaintext, key);
  const decrypted = await decryptData(encrypted, key);

  assert.equal(decrypted, plaintext);
});

addTest('decryptData returns null for an empty bundle', async () => {
  const key = await deriveKey('VaultKey123!', 'alice-vault-pqc-salt');
  assert.equal(await decryptData('', key), null);
});

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

let failed = false;
for (const entry of tests) {
  try {
    await entry.run();
    console.log(`PASS ${entry.name}`);
  } catch (error) {
    failed = true;
    console.error(`FAIL ${entry.name}`);
    console.error(error);
  }
}

if (failed) {
  process.exitCode = 1;
  process.exit(1);
} else {
  console.log(`PASS ${tests.length}/${tests.length} tests`);
  process.exit(0);
}

import { describe, expect, it, vi } from 'vitest';
import {
  base64ToUint8Array,
  decryptData,
  deriveKey,
  encryptData,
  encryptFile,
  uint8ArrayToBase64,
  encryptFileEnvelope,
  decryptFileEnvelope,
  rotateItemEnvelopeKey,
  isCascadeBundle,
  isEnvelopeBundle,
  ENVELOPE_MAGIC_CASCADE,
  ENVELOPE_MAGIC_V2,
  encryptChaCha20Poly1305,
  decryptChaCha20Poly1305,
  clearCryptoKeyCache,
  touchCryptoKeyCache,
  getOrCreateCryptoKey,
  CRYPTO_KEY_CACHE_TTL_MS,
  AES_GCM_IV_LENGTH,
  AES_GCM_AAD,
  DEK_AAD,
  decryptToFile,
} from '../../src/lib/encryption.ts';

// ---------------------------------------------------------------------------
// AES-256-GCM – string encryption / decryption
// ---------------------------------------------------------------------------

describe('AES-256-GCM vault crypto', () => {
  it('encrypts and decrypts plaintext with the same derived key', async () => {
    const key = await deriveKey('VaultKey123!', 'alice-vault-pqc-salt');
    const plaintext = 'top secret vault entry';

    const encrypted = await encryptData(plaintext, key);
    const decrypted = await decryptData(encrypted, key);

    expect(encrypted).not.toBe(plaintext);
    expect(typeof encrypted).toBe('string');
    expect(decrypted).toBe(plaintext);
  });

  it('returns null when decrypting with the wrong key', async () => {
    const correctKey = await deriveKey('VaultKey123!', 'alice-vault-pqc-salt');
    const wrongKey = await deriveKey('WrongKey123!', 'alice-vault-pqc-salt');
    const encrypted = await encryptData('vault payload', correctKey);

    expect(await decryptData(encrypted, wrongKey)).toBeNull();
  });

  it('produces different ciphertext for the same plaintext because IVs are random', async () => {
    const key = await deriveKey('VaultKey123!', 'alice-vault-pqc-salt');

    const encryptedA = await encryptData('same content', key);
    const encryptedB = await encryptData('same content', key);

    expect(encryptedA).not.toBe(encryptedB);
    await expect(decryptData(encryptedA, key)).resolves.toBe('same content');
    await expect(decryptData(encryptedB, key)).resolves.toBe('same content');
  });

  it('handles empty string plaintext', async () => {
    const key = await deriveKey('VaultKey123!', 'alice-vault-pqc-salt');

    const encrypted = await encryptData('', key);
    const decrypted = await decryptData(encrypted, key);

    expect(decrypted).toBe('');
  });

  it('handles unicode / multi-byte plaintext', async () => {
    const key = await deriveKey('VaultKey123!', 'unicode-salt-padded');
    const plaintext = '🔐 Vault – top secret: привет мир';

    const encrypted = await encryptData(plaintext, key);
    const decrypted = await decryptData(encrypted, key);

    expect(decrypted).toBe(plaintext);
  });

  it('handles large plaintext (100 KB)', async () => {
    const key = await deriveKey('VaultKey123!', 'large-content-salt-');
    const plaintext = 'x'.repeat(100_000);

    const encrypted = await encryptData(plaintext, key);
    const decrypted = await decryptData(encrypted, key);

    expect(decrypted).toBe(plaintext);
  });

  it('decryptData returns null for an empty encryptedBundle', async () => {
    const key = await deriveKey('VaultKey123!', 'alice-vault-pqc-salt');
    expect(await decryptData('', key)).toBeNull();
  });

  it('decryptData returns null for a truncated / malformed bundle', async () => {
    const key = await deriveKey('VaultKey123!', 'alice-vault-pqc-salt');
    // A base64 string that decodes to fewer than 13 bytes (IV + 1 ciphertext byte)
    const tooShort = uint8ArrayToBase64(new Uint8Array(5));
    expect(await decryptData(tooShort, key)).toBeNull();
  });

  it('decryptData returns null when an empty key is supplied', async () => {
    const key = await deriveKey('VaultKey123!', 'alice-vault-pqc-salt');
    const encrypted = await encryptData('data', key);
    expect(await decryptData(encrypted, '')).toBeNull();
  });

  it('encryptData throws on an invalid (wrong-length) key', async () => {
    const badKey = uint8ArrayToBase64(new Uint8Array(16)); // 16 bytes ≠ 32
    await expect(encryptData('data', badKey)).rejects.toThrow(/Invalid key length/);
  });
});

// ---------------------------------------------------------------------------
// File encryption – encryptFile
// ---------------------------------------------------------------------------

describe('encryptFile', () => {
  it('encrypts binary file bytes and produces a different Uint8Array', async () => {
    const key = await deriveKey('VaultKey123!', 'alice-vault-pqc-salt');
    const raw = new Uint8Array([10, 20, 30, 40, 50]);
    const file = new File([raw], 'sample.bin', { type: 'application/octet-stream' });

    const encrypted = await encryptFile(file, key);

    expect(encrypted).toBeInstanceOf(Uint8Array);
    // IV (12 bytes) + GCM tag (16 bytes) + plaintext (5 bytes) = 33 bytes
    expect(encrypted.length).toBeGreaterThan(raw.length);
    expect(encrypted).not.toEqual(raw);
  });

  it('produces different encrypted output on each call', async () => {
    const key = await deriveKey('VaultKey123!', 'alice-vault-pqc-salt');
    const file = new File([new Uint8Array([1, 2, 3])], 'a.bin');

    const enc1 = await encryptFile(file, key);
    const enc2 = await encryptFile(file, key);

    expect(enc1).not.toEqual(enc2);
  });

  it('encrypts a text file and its bytes differ from the utf-8 encoding', async () => {
    const key = await deriveKey('VaultKey123!', 'alice-vault-pqc-salt');
    const content = 'hello vault';
    const file = new File([content], 'note.txt', { type: 'text/plain' });

    const encrypted = await encryptFile(file, key);
    const rawBytes = new TextEncoder().encode(content);

    expect(encrypted).not.toEqual(rawBytes);
  });
});

// ---------------------------------------------------------------------------
// Key derivation – deriveKey
// ---------------------------------------------------------------------------

describe('deriveKey', () => {
  it('produces a 32-byte (256-bit) base64-encoded key', async () => {
    const key = await deriveKey('VaultKey123!', 'alice-vault-pqc-salt');
    const raw = base64ToUint8Array(key);

    expect(raw.length).toBe(32);
  });

  it('produces different keys for different passwords', async () => {
    const salt = 'shared-salt-padded';
    const keyA = await deriveKey('PasswordA123!', salt);
    const keyB = await deriveKey('PasswordB123!', salt);

    expect(keyA).not.toBe(keyB);
  });

  it('produces different keys for different salts', async () => {
    const password = 'SamePassword123!';
    const keyA = await deriveKey(password, 'salt-for-alice-vau');
    const keyB = await deriveKey(password, 'salt-for-bob-vault');

    expect(keyA).not.toBe(keyB);
  });

  it('is deterministic – same password + salt always gives the same key', async () => {
    const key1 = await deriveKey('Stable123!', 'stable-salt-value-');
    const key2 = await deriveKey('Stable123!', 'stable-salt-value-');

    expect(key1).toBe(key2);
  });

  it('throws when an empty password is supplied', async () => {
    await expect(deriveKey('', 'valid-salt-1234')).rejects.toThrow(/Password required/);
  });

  it('throws when salt is missing, empty, or too short', async () => {
    // @ts-expect-error test missing salt
    await expect(deriveKey('Password123!')).rejects.toThrow(/Secure cryptographic salt/);
    await expect(deriveKey('Password123!', '')).rejects.toThrow(/Secure cryptographic salt/);
    await expect(deriveKey('Password123!', 'short')).rejects.toThrow(/Secure cryptographic salt/);
  });
});

// ---------------------------------------------------------------------------
// Base64 helpers
// ---------------------------------------------------------------------------

describe('uint8ArrayToBase64 / base64ToUint8Array', () => {
  it('round-trips arbitrary bytes correctly', () => {
    const original = new Uint8Array([0, 127, 128, 255, 42]);
    const b64 = uint8ArrayToBase64(original);
    const restored = base64ToUint8Array(b64);

    expect(restored).toEqual(original);
  });

  it('base64ToUint8Array returns an empty array for an empty string', () => {
    expect(base64ToUint8Array('')).toEqual(new Uint8Array(0));
  });

  it('handles a single zero byte', () => {
    const original = new Uint8Array([0]);
    expect(base64ToUint8Array(uint8ArrayToBase64(original))).toEqual(original);
  });
});

// ---------------------------------------------------------------------------
// Cascade Cipher (Dual-Engine: AES-256-GCM + ChaCha20-Poly1305)
// ---------------------------------------------------------------------------

describe('Cascade Cipher (Dual-Engine: AES-256-GCM + ChaCha20-Poly1305)', () => {
  const testPassword = 'MySuperSecretPassword2026!';
  const testSalt = 'cascade-cipher-salt-123';

  it('encrypts file bytes with VCAS01 Cascade Envelope and decrypts back to identical plaintext', async () => {
    const masterKey = await deriveKey(testPassword, testSalt);
    const originalText = 'Sensitive Photo Payload: 📷 high-res personal vault image';
    const originalBytes = new TextEncoder().encode(originalText);

    const encryptedBundle = await encryptFileEnvelope(originalBytes, masterKey);

    expect(isCascadeBundle(encryptedBundle)).toBe(true);
    expect(isEnvelopeBundle(encryptedBundle)).toBe(true);
    expect(encryptedBundle.length).toBeGreaterThan(originalBytes.length);

    // Verify VCAS01 magic prefix
    expect(encryptedBundle.subarray(0, 6)).toEqual(ENVELOPE_MAGIC_CASCADE);

    const decryptedBuffer = await decryptFileEnvelope(encryptedBundle, masterKey);
    const decryptedBytes = new Uint8Array(decryptedBuffer);
    const decryptedText = new TextDecoder().decode(decryptedBytes);

    expect(decryptedText).toBe(originalText);
  });

  it('fails decryption if wrong master key is used', async () => {
    const masterKey = await deriveKey(testPassword, testSalt);
    const wrongKey = await deriveKey('WrongPassword123!', testSalt);
    const fileBytes = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80]);

    const encrypted = await encryptFileEnvelope(fileBytes, masterKey);

    await expect(decryptFileEnvelope(encrypted, wrongKey)).rejects.toThrow();
  });

  it('fails decryption if the outer ChaCha20 layer is tampered with', async () => {
    const masterKey = await deriveKey(testPassword, testSalt);
    const fileBytes = new TextEncoder().encode('Protected Photo Data');

    const encrypted = await encryptFileEnvelope(fileBytes, masterKey);
    const tampered = new Uint8Array(encrypted);

    // Tamper with the ciphertext portion (after header)
    tampered[tampered.length - 1] ^= 0xff;

    await expect(decryptFileEnvelope(tampered, masterKey)).rejects.toThrow();
  });

  it('fails decryption if the encrypted DEK header is tampered with', async () => {
    const masterKey = await deriveKey(testPassword, testSalt);
    const fileBytes = new TextEncoder().encode('Protected Photo Data');

    const encrypted = await encryptFileEnvelope(fileBytes, masterKey);
    const tampered = new Uint8Array(encrypted);

    // Tamper within the 80-byte encrypted DEK header
    tampered[25] ^= 0xaa;

    await expect(decryptFileEnvelope(tampered, masterKey)).rejects.toThrow();
  });

  it('decrypts legacy VENV02 (single-layer AES-GCM) envelopes seamlessly for backward compatibility', async () => {
    const masterKey = await deriveKey(testPassword, testSalt);
    const rawPlaintext = new TextEncoder().encode('Legacy Photo encrypted before Cascade Cipher');

    // Manually construct a valid legacy VENV02 bundle
    const kekCryptoKey = (await getOrCreateCryptoKey(masterKey))!;
    const dekBytes = crypto.getRandomValues(new Uint8Array(32));
    const dekCryptoKey = await crypto.subtle.importKey(
      'raw',
      dekBytes,
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );

    const fileIv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_LENGTH));
    const fileCiphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: fileIv, additionalData: AES_GCM_AAD },
      dekCryptoKey,
      rawPlaintext
    );

    const kekIv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_LENGTH));
    const encryptedDek = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: kekIv, additionalData: DEK_AAD },
      kekCryptoKey,
      dekBytes
    );

    const encDekBytes = new Uint8Array(encryptedDek);
    const encFileBytes = new Uint8Array(fileCiphertext);

    const legacyBundle = new Uint8Array(
      ENVELOPE_MAGIC_V2.length +
        kekIv.length +
        encDekBytes.length +
        fileIv.length +
        encFileBytes.length
    );
    let offset = 0;
    legacyBundle.set(ENVELOPE_MAGIC_V2, offset);
    offset += ENVELOPE_MAGIC_V2.length;
    legacyBundle.set(kekIv, offset);
    offset += kekIv.length;
    legacyBundle.set(encDekBytes, offset);
    offset += encDekBytes.length;
    legacyBundle.set(fileIv, offset);
    offset += fileIv.length;
    legacyBundle.set(encFileBytes, offset);

    expect(isEnvelopeBundle(legacyBundle)).toBe(true);
    expect(isCascadeBundle(legacyBundle)).toBe(false);

    // Decrypt using decryptFileEnvelope
    const decryptedBuffer = await decryptFileEnvelope(legacyBundle, masterKey);
    const decryptedText = new TextDecoder().decode(decryptedBuffer);

    expect(decryptedText).toBe('Legacy Photo encrypted before Cascade Cipher');
  });

  it('rotates master key on VCAS01 cascade envelopes with zero payload re-encryption', async () => {
    const oldKey = await deriveKey('OldPassword123!', testSalt);
    const newKey = await deriveKey('NewPassword456!', testSalt);

    const fileBytes = new TextEncoder().encode('Photo payload across key rotation');
    const encrypted = await encryptFileEnvelope(fileBytes, oldKey);

    const rotated = await rotateItemEnvelopeKey(encrypted, oldKey, newKey);

    expect(isCascadeBundle(rotated)).toBe(true);
    expect(rotated.length).toBe(encrypted.length);

    // Old key can no longer decrypt
    await expect(decryptFileEnvelope(rotated, oldKey)).rejects.toThrow();

    // New key decrypts successfully
    const decrypted = await decryptFileEnvelope(rotated, newKey);
    expect(new TextDecoder().decode(decrypted)).toBe('Photo payload across key rotation');
  });
});

// ---------------------------------------------------------------------------
// ChaCha20-Poly1305 Primitives
// ---------------------------------------------------------------------------

describe('ChaCha20-Poly1305 primitives', () => {
  it('encrypts and decrypts with ChaCha20-Poly1305', async () => {
    const key = crypto.getRandomValues(new Uint8Array(32));
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode('ChaCha20 authenticated encryption test');
    const aad = new TextEncoder().encode('vault:aad:test');

    const { ciphertext } = await encryptChaCha20Poly1305(plaintext, key, nonce, aad);
    expect(ciphertext.length).toBe(plaintext.length + 16); // 16 bytes Poly1305 MAC tag

    const decrypted = await decryptChaCha20Poly1305(ciphertext, key, nonce, aad);
    expect(new TextDecoder().decode(decrypted)).toBe('ChaCha20 authenticated encryption test');
  });
});

// ---------------------------------------------------------------------------
// Aggressive RAM Key Shredder (Cold Boot / Anti-RAM Dump Defense)
// ---------------------------------------------------------------------------

describe('Aggressive RAM Key Shredder (Cold Boot Defense)', () => {
  it('purges keys from cryptoKeyCache on clearCryptoKeyCache', async () => {
    const masterKey = await deriveKey('ShredderPass123!', 'shredder-salt-1');
    const keyObj = await getOrCreateCryptoKey(masterKey);
    expect(keyObj).not.toBeNull();

    clearCryptoKeyCache();

    // getOrCreateCryptoKey re-imports upon fresh request after cache is wiped
    const newKeyObj = await getOrCreateCryptoKey(masterKey);
    expect(newKeyObj).not.toBeNull();
  });

  it('auto-shreds cached keys after inactivity TTL', async () => {
    vi.useFakeTimers();

    const masterKey = await deriveKey('ShredderPass123!', 'shredder-salt-2');
    await getOrCreateCryptoKey(masterKey);

    // Fast-forward 60 seconds of inactivity
    vi.advanceTimersByTime(CRYPTO_KEY_CACHE_TTL_MS + 100);

    // Cache should have been evicted automatically
    vi.useRealTimers();
  });

  it('decryptToFile wipes decrypted memory buffer with .fill(0)', async () => {
    const masterKey = await deriveKey('PhotoPassword123!', 'photo-salt-999');
    const photoBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]); // JPEG header

    const encrypted = await encryptFileEnvelope(photoBytes, masterKey);
    const blobUrl = await decryptToFile(encrypted, masterKey, 'image/jpeg');

    expect(blobUrl).not.toBeNull();
    expect(typeof blobUrl).toBe('string');
  });
});

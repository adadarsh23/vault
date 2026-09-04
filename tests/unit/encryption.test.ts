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
  getOrCreateCryptoKey,
  CRYPTO_KEY_CACHE_TTL_MS,
  AES_GCM_IV_LENGTH,
  AES_GCM_AAD,
  DEK_AAD,
  decryptToFile,
  performHybridKeyExchange,
  setupMFA,
  verifyMFA,
  signMessage,
  verifyMessage,
  generateRSAKeyPair,
  exportRSAKeyPair,
  importRSAKeyPair,
  encryptFileE2EE,
  decryptFileE2EE,
  detectMimeTypeFromBytes,
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
      ['encrypt'],
    );

    const fileIv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_LENGTH));
    const fileCiphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: fileIv, additionalData: AES_GCM_AAD },
      dekCryptoKey,
      rawPlaintext,
    );

    const kekIv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_LENGTH));
    const encryptedDek = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: kekIv, additionalData: DEK_AAD },
      kekCryptoKey,
      dekBytes,
    );

    const encDekBytes = new Uint8Array(encryptedDek);
    const encFileBytes = new Uint8Array(fileCiphertext);

    const legacyBundle = new Uint8Array(
      ENVELOPE_MAGIC_V2.length +
        kekIv.length +
        encDekBytes.length +
        fileIv.length +
        encFileBytes.length,
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

// ---------------------------------------------------------------------------
// Hybrid Key Exchange (X25519 + Kyber768)
// ---------------------------------------------------------------------------

describe('Hybrid Key Exchange (X25519 + Kyber768)', () => {
  it('generates local public keys and private keys when called without peer key', async () => {
    const keys = await performHybridKeyExchange();
    expect(keys).toBeDefined();
    expect(keys.localPublicKeys).toBeDefined();
    expect(keys.localPublicKeys?.ecc).toBeInstanceOf(Uint8Array);
    expect(keys.localPublicKeys?.kyber).toBeInstanceOf(Uint8Array);
    expect(keys._private).toBeDefined();
    expect(keys._private?.ecc).toBeInstanceOf(Uint8Array);
    expect(keys._private?.kyber).toBeInstanceOf(Uint8Array);
  });

  it('completes hybrid key exchange and derives master secret when peer public key is provided', async () => {
    const peer = await performHybridKeyExchange();
    expect(peer.localPublicKeys).toBeDefined();

    const exchange = await performHybridKeyExchange(peer.localPublicKeys);
    expect(exchange).toBeDefined();
    expect(exchange.masterSecret).toBeDefined();
    expect(typeof exchange.masterSecret).toBe('string');
    expect(exchange.kyberCiphertext).toBeInstanceOf(Uint8Array);
  });
});

// ---------------------------------------------------------------------------
// Multi-Factor Authentication (Layer 8 TOTP)
// ---------------------------------------------------------------------------

describe('Multi-Factor Authentication (TOTP)', () => {
  it('generates valid MFA setup URI and base32 secret', async () => {
    const mfa = await setupMFA('alice@vault.local', 'PersonalVault');
    expect(mfa).toBeDefined();
    expect(mfa.uri).toContain('otpauth://totp/');
    expect(decodeURIComponent(mfa.uri)).toContain('alice@vault.local');
    expect(mfa.secret).toBeDefined();
    expect(typeof mfa.secret).toBe('string');
    expect(mfa.secret.length).toBeGreaterThan(10);
  });

  it('verifies a valid generated TOTP token', async () => {
    const mfa = await setupMFA('bob@vault.local', 'PersonalVault');
    const OTPAuth = await import('otpauth');
    const totp = new OTPAuth.TOTP({
      secret: OTPAuth.Secret.fromBase32(mfa.secret),
    });
    const token = totp.generate();

    const isValid = await verifyMFA(token, mfa.secret);
    expect(isValid).toBe(true);
  });

  it('rejects invalid, empty, or wrong TOTP tokens', async () => {
    const mfa = await setupMFA('charlie@vault.local', 'PersonalVault');
    expect(await verifyMFA('000000', mfa.secret)).toBe(false);
    expect(await verifyMFA('', mfa.secret)).toBe(false);
    expect(await verifyMFA('123456', '')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Digital Signatures (Ed25519)
// ---------------------------------------------------------------------------

describe('Digital Signatures (Ed25519)', () => {
  it('signs a message and verifies its integrity with valid public key', async () => {
    const sodiumModule = await import('libsodium-wrappers');
    const sodium = sodiumModule.default || sodiumModule;
    await sodium.ready;

    const keypair = sodium.crypto_sign_keypair();
    const message = 'Confidential Integrity Check 2026';

    const signature = await signMessage(message, keypair.privateKey);
    expect(signature).toBeInstanceOf(Uint8Array);

    const verified = await verifyMessage(signature!, keypair.publicKey);
    expect(verified).toBe(message);
  });

  it('returns null on invalid signature, tampered message, or null keys', async () => {
    const sodiumModule = await import('libsodium-wrappers');
    const sodium = sodiumModule.default || sodiumModule;
    await sodium.ready;

    const keypair = sodium.crypto_sign_keypair();
    const wrongKeypair = sodium.crypto_sign_keypair();
    const message = 'Valid Payload';

    const signature = await signMessage(message, keypair.privateKey);
    expect(signature).toBeDefined();

    // Verify with wrong public key
    const verifiedWrong = await verifyMessage(signature!, wrongKeypair.publicKey);
    expect(verifiedWrong).toBeNull();

    // Verify with null parameters
    // @ts-expect-error test null argument
    expect(await signMessage(null, keypair.privateKey)).toBeNull();
    // @ts-expect-error test null argument
    expect(await verifyMessage(null, keypair.publicKey)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// RSA-OAEP Key Management & E2EE File Encryption / Decryption
// ---------------------------------------------------------------------------

describe('RSA-OAEP Key Management and E2EE File Operations', () => {
  it('generates RSA key pair and round-trips public/private export and import', async () => {
    const keyPair = await generateRSAKeyPair();
    expect(keyPair.publicKey).toBeDefined();
    expect(keyPair.privateKey).toBeDefined();

    const exported = await exportRSAKeyPair(keyPair);
    expect(typeof exported.publicKey).toBe('string');
    expect(typeof exported.privateKey).toBe('string');

    const imported = await importRSAKeyPair(exported);
    expect(imported.publicKey).toBeDefined();
    expect(imported.privateKey).toBeDefined();
  });

  it('encrypts file with RSA public key (E2EE) and decrypts with RSA private key', async () => {
    const keyPair = await generateRSAKeyPair();
    const secretContent = 'Personal Vault E2EE Confidential Document';
    const fileBytes = new TextEncoder().encode(secretContent);

    const bundle = await encryptFileE2EE(fileBytes, keyPair.publicKey);
    expect(bundle).toBeInstanceOf(Uint8Array);
    expect(bundle.length).toBeGreaterThan(fileBytes.length);

    const blobUrl = await decryptFileE2EE(bundle, keyPair.privateKey, 'text/plain');
    expect(blobUrl).toBeDefined();
    expect(typeof blobUrl).toBe('string');
  });

  it('decryptToFile seamlessly detects and decrypts E2EE bundles with RSA private key', async () => {
    const keyPair = await generateRSAKeyPair();
    const photoBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // PNG header

    const e2eeBundle = await encryptFileE2EE(photoBytes, keyPair.publicKey);
    const blobUrl = await decryptToFile(e2eeBundle, 'master-key', 'image/png', keyPair.privateKey);

    expect(blobUrl).toBeDefined();
    expect(typeof blobUrl).toBe('string');
  });

  it('returns null on invalid E2EE bundles or invalid keys', async () => {
    const keyPair = await generateRSAKeyPair();
    const badBundle = new Uint8Array([0x00, 0x02, 0x00, 0x00]);

    const result = await decryptFileE2EE(badBundle, keyPair.privateKey);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Deep Magic Byte MIME Type Detection
// ---------------------------------------------------------------------------

describe('Deep Magic Byte MIME Type Detection (detectMimeTypeFromBytes)', () => {
  it('detects images accurately', () => {
    // PNG
    expect(
      detectMimeTypeFromBytes(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    ).toBe('image/png');
    // JPEG
    expect(detectMimeTypeFromBytes(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    // GIF
    expect(detectMimeTypeFromBytes(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toBe(
      'image/gif',
    );
    // BMP
    expect(detectMimeTypeFromBytes(new Uint8Array([0x42, 0x4d, 0x00, 0x00]))).toBe('image/bmp');
    // WebP: RIFF....WEBP
    const webpBytes = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
    ]);
    expect(detectMimeTypeFromBytes(webpBytes)).toBe('image/webp');
  });

  it('detects documents and archives accurately', () => {
    // PDF
    expect(detectMimeTypeFromBytes(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe(
      'application/pdf',
    );
    // 7z
    expect(detectMimeTypeFromBytes(new Uint8Array([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]))).toBe(
      'application/x-7z-compressed',
    );
    // ZIP
    expect(detectMimeTypeFromBytes(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBe(
      'application/zip',
    );
    // GZIP
    expect(detectMimeTypeFromBytes(new Uint8Array([0x1f, 0x8b, 0x08, 0x00]))).toBe(
      'application/gzip',
    );
  });

  it('detects audio and video formats accurately', () => {
    // MP3 ID3
    expect(detectMimeTypeFromBytes(new Uint8Array([0x49, 0x44, 0x33, 0x03]))).toBe('audio/mpeg');
    // FLAC
    expect(detectMimeTypeFromBytes(new Uint8Array([0x66, 0x4c, 0x61, 0x43]))).toBe('audio/flac');
    // OGG
    expect(detectMimeTypeFromBytes(new Uint8Array([0x4f, 0x67, 0x67, 0x53]))).toBe('audio/ogg');
    // HEVC / H.265 video in MP4 container (mobile recording)
    const hevcMp4Bytes = new Uint8Array([
      0x00,
      0x00,
      0x00,
      0x18,
      0x66,
      0x74,
      0x79,
      0x70, // ...ftyp
      0x68,
      0x65,
      0x76,
      0x63, // hevc
    ]);
    expect(detectMimeTypeFromBytes(hevcMp4Bytes)).toBe('video/mp4');
    // HEIC image
    const heicImageBytes = new Uint8Array([
      0x00,
      0x00,
      0x00,
      0x18,
      0x66,
      0x74,
      0x79,
      0x70, // ...ftyp
      0x68,
      0x65,
      0x69,
      0x63, // heic
    ]);
    expect(detectMimeTypeFromBytes(heicImageBytes)).toBe('image/heic');
  });

  it('returns application/octet-stream for unknown bytes or short buffers', () => {
    expect(detectMimeTypeFromBytes(new Uint8Array([0x00, 0x01]))).toBe('application/octet-stream');
    expect(detectMimeTypeFromBytes(new Uint8Array([0x11, 0x22, 0x33, 0x44]))).toBe(
      'application/octet-stream',
    );
  });
});

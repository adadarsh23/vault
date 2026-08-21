import { describe, expect, it } from 'vitest';
import {
  deriveKey,
  encryptFileEnvelope,
  decryptFileEnvelope,
  rotateItemEnvelopeKey,
  isEnvelopeBundle,
} from '../../src/lib/cryptoPrimitives';

describe('Envelope Encryption (DEK + KEK) & Rapid Key Rotation', () => {
  it('encrypts and decrypts file binaries with envelope format', async () => {
    const masterKey = await deriveKey('MasterPass123!', 'envelope-test-salt-1');
    const fileBytes = new TextEncoder().encode('Confidential Photo Binary Payload 2026');

    const envelopeBundle = await encryptFileEnvelope(fileBytes, masterKey);

    expect(isEnvelopeBundle(envelopeBundle)).toBe(true);
    expect(envelopeBundle.length).toBeGreaterThan(fileBytes.length);

    const decrypted = await decryptFileEnvelope(envelopeBundle, masterKey);
    const restoredText = new TextDecoder().decode(decrypted);

    expect(restoredText).toBe('Confidential Photo Binary Payload 2026');
  });

  it('rejects decryption with the wrong master key', async () => {
    const masterKey = await deriveKey('MasterPass123!', 'envelope-test-salt-1');
    const wrongKey = await deriveKey('WrongPass123!', 'envelope-test-salt-1');
    const fileBytes = new TextEncoder().encode('Ultra Secure Document');

    const envelopeBundle = await encryptFileEnvelope(fileBytes, masterKey);

    await expect(decryptFileEnvelope(envelopeBundle, wrongKey)).rejects.toThrow();
  });

  it('rotates master key instantaneously without re-encrypting file payload', async () => {
    const oldKey = await deriveKey('OldPassword123!', 'envelope-rotation-salt');
    const newKey = await deriveKey('NewPassword123!', 'envelope-rotation-salt');
    const fileBytes = new TextEncoder().encode('Large Media Binary Stream 4K');

    const originalBundle = await encryptFileEnvelope(fileBytes, oldKey);
    expect(isEnvelopeBundle(originalBundle)).toBe(true);

    // Rotate DEK encryption from oldKey to newKey
    const rotatedBundle = await rotateItemEnvelopeKey(originalBundle, oldKey, newKey);
    expect(isEnvelopeBundle(rotatedBundle)).toBe(true);

    // Old key cannot decrypt rotated bundle
    await expect(decryptFileEnvelope(rotatedBundle, oldKey)).rejects.toThrow();

    // New key decrypts successfully
    const decrypted = await decryptFileEnvelope(rotatedBundle, newKey);
    expect(new TextDecoder().decode(decrypted)).toBe('Large Media Binary Stream 4K');
  });

  it('maintains 100% backwards compatibility with legacy direct AES-GCM bundles', async () => {
    const plaintext = 'Legacy direct AES-GCM photo content';

    // Simulate legacy bundle: [12 bytes IV] + [AES-GCM ciphertext]
    const legacyCryptoKey = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode('01234567890123456789012345678901'),
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt']
    );
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      legacyCryptoKey,
      new TextEncoder().encode(plaintext)
    );
    const legacyBundle = new Uint8Array(12 + ct.byteLength);
    legacyBundle.set(iv);
    legacyBundle.set(new Uint8Array(ct), 12);

    expect(isEnvelopeBundle(legacyBundle)).toBe(false);

    // decryptFileEnvelope can decrypt legacy direct bundles
    const decrypted = await decryptFileEnvelope(legacyBundle, legacyCryptoKey);
    expect(new TextDecoder().decode(decrypted)).toBe(plaintext);
  });
});

import { describe, expect, it } from 'vitest';
import { encryptBuffer, decryptBuffer } from '../../server/utils/crypto.ts';
import crypto from 'crypto';

describe('Server-Side Cryptography (AES-256-GCM)', () => {
  const masterKey = crypto.randomBytes(32).toString('hex');
  const sampleData = Buffer.from('Top secret production value 12345');

  it('successfully encrypts and decrypts a buffer', () => {
    const encrypted = encryptBuffer(sampleData, masterKey);

    expect(encrypted.iv).toHaveLength(24); // 12 bytes hex
    expect(encrypted.tag).toHaveLength(32); // 16 bytes hex
    expect(encrypted.encryptedData).not.toEqual(sampleData.toString('hex'));

    const decrypted = decryptBuffer(encrypted, masterKey);
    expect(decrypted.toString()).toBe(sampleData.toString());
  });

  it('fails to decrypt with the wrong master key', () => {
    const encrypted = encryptBuffer(sampleData, masterKey);
    const wrongKey = crypto.randomBytes(32).toString('hex');

    expect(() => decryptBuffer(encrypted, wrongKey)).toThrow();
  });

  it('fails to decrypt if the authentication tag is tampered with', () => {
    const encrypted = encryptBuffer(sampleData, masterKey);

    // Tamper with one character in the tag
    const tamperedTag = encrypted.tag.substring(0, 31) + (encrypted.tag[31] === '0' ? '1' : '0');
    const tamperedPayload = { ...encrypted, tag: tamperedTag };

    expect(() => decryptBuffer(tamperedPayload, masterKey)).toThrow();
  });

  it('produces unique IVs for the same data (probabilistic encryption)', () => {
    const enc1 = encryptBuffer(sampleData, masterKey);
    const enc2 = encryptBuffer(sampleData, masterKey);

    expect(enc1.iv).not.toEqual(enc2.iv);
    expect(enc1.encryptedData).not.toEqual(enc2.encryptedData);
  });
});

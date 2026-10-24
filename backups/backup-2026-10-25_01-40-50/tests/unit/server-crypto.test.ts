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

  it('securely hashes and verifies passwords using one-way scrypt KDF', async () => {
    const { hashPassword, comparePassword } = await import('../../server/utils/crypto.ts');
    const password = 'SuperSecretPassword123!#$';
    const hash = await hashPassword(password);

    expect(hash).toMatch(/^s2\$/);
    const isValid = await comparePassword(password, hash);
    expect(isValid).toBe(true);

    const isInvalid = await comparePassword('WrongPassword123!', hash);
    expect(isInvalid).toBe(false);
  });

  it('handles null, undefined, and non-existent hashes with constant-time dummy computation', async () => {
    const { comparePassword } = await import('../../server/utils/crypto.ts');
    const password = 'TestPassword123!';
    expect(await comparePassword(password, null)).toBe(false);
    expect(await comparePassword(password, undefined)).toBe(false);
    expect(await comparePassword(password, 'invalid-hash-string')).toBe(false);
    expect(await comparePassword(password, '$argon2id$v=19$m=65536,t=3,p=4$somebadhash')).toBe(
      false,
    );
  });

  it('enforces Unicode NFKC normalization during password hashing and verification', async () => {
    const { hashPassword, comparePassword } = await import('../../server/utils/crypto.ts');
    const composed = 'Password\u00E9123!4567890';
    const decomposed = 'Password\u0065\u0301123!4567890';

    const hashedComposed = await hashPassword(composed);
    expect(await comparePassword(decomposed, hashedComposed)).toBe(true);

    const hashedDecomposed = await hashPassword(decomposed);
    expect(await comparePassword(composed, hashedDecomposed)).toBe(true);
  });
});

describe('2FA Security Hardening & Replay Prevention', () => {
  it('verifies valid TOTP and returns matchedTimeStep', async () => {
    const speakeasy = (await import('speakeasy')).default;
    const { verifyOTPWithReplayDefense } =
      await import('../../server/services/twoFactorService.ts');
    const secret = speakeasy.generateSecret({ length: 20 }).base32;
    const token = speakeasy.totp({ secret, encoding: 'base32' });

    const result = verifyOTPWithReplayDefense(secret, token, 0);
    expect(result.isValid).toBe(true);
    expect(typeof result.matchedTimeStep).toBe('number');
    expect(result.matchedTimeStep).toBeGreaterThan(0);
  });

  it('rejects replayed TOTP tokens using the same or earlier time step', async () => {
    const speakeasy = (await import('speakeasy')).default;
    const { verifyOTPWithReplayDefense } =
      await import('../../server/services/twoFactorService.ts');
    const secret = speakeasy.generateSecret({ length: 20 }).base32;
    const token = speakeasy.totp({ secret, encoding: 'base32' });

    const firstAttempt = verifyOTPWithReplayDefense(secret, token, 0);
    expect(firstAttempt.isValid).toBe(true);
    const usedTimeStep = firstAttempt.matchedTimeStep!;

    const replayAttempt = verifyOTPWithReplayDefense(secret, token, usedTimeStep);
    expect(replayAttempt.isValid).toBe(false);
  });

  it('generates 10 unique 8-character backup codes', async () => {
    const { generateBackupCodes } = await import('../../server/services/twoFactorService.ts');
    const { comparePassword } = await import('../../server/utils/crypto.ts');

    const { plain, hashed } = await generateBackupCodes();
    expect(plain.length).toBe(10);
    expect(hashed.length).toBe(10);

    const uniqueCodes = new Set(plain);
    expect(uniqueCodes.size).toBe(10);

    for (const code of plain) {
      expect(code).toMatch(/^[a-zA-Z0-9]{8}$/);
      expect(code.length).toBe(8);
    }

    for (let i = 0; i < plain.length; i++) {
      expect(await comparePassword(plain[i], hashed[i])).toBe(true);
    }
  });

  it('rejects invalid backup code formats fast without database lookup', async () => {
    const { consumeBackupCodeAtomic } = await import('../../server/services/twoFactorService.ts');

    expect(await consumeBackupCodeAtomic('anyUser', '')).toBe(false);
    expect(await consumeBackupCodeAtomic('anyUser', '12345')).toBe(false); // length 5
    expect(await consumeBackupCodeAtomic('anyUser', '123456')).toBe(false); // length 6 (OTP token, not backup code)
    expect(await consumeBackupCodeAtomic('anyUser', '1234567')).toBe(false); // length 7
    expect(await consumeBackupCodeAtomic('anyUser', '123456789')).toBe(false); // length 9
    expect(await consumeBackupCodeAtomic('anyUser', 'bad$code')).toBe(false); // special characters
    expect(await consumeBackupCodeAtomic('anyUser', null as any)).toBe(false);
  });
});

import crypto from 'crypto';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
dotenv.config();

const ENCRYPTION_KEY_SOURCE = process.env.VAULT_ENCRYPTION_KEY || '';

const resolveEncryptionKey = (): Buffer => {
  if (!ENCRYPTION_KEY_SOURCE) {
    const isDev = process.env.NODE_ENV !== 'production';
    if (isDev) {
      // In development, use a deterministic default key
      return Buffer.from('0'.repeat(64), 'hex');
    }
    throw new Error('VAULT_ENCRYPTION_KEY environment variable must be configured in production.');
  }

  const hexCandidate = /^[a-f0-9]{64}$/i.test(ENCRYPTION_KEY_SOURCE)
    ? Buffer.from(ENCRYPTION_KEY_SOURCE, 'hex')
    : null;

  if (hexCandidate?.length === 32) {
    return hexCandidate;
  }

  const base64Candidate = (() => {
    try {
      return Buffer.from(ENCRYPTION_KEY_SOURCE, 'base64');
    } catch {
      return null;
    }
  })();

  if (base64Candidate?.length === 32) {
    return base64Candidate;
  }

  return crypto.createHash('sha256').update(ENCRYPTION_KEY_SOURCE).digest();
};

const encryptionKey = resolveEncryptionKey();

const resolveAuthPepper = (): string => {
  const pepper = process.env.AUTH_PEPPER?.trim();
  if (pepper) {
    return pepper;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('AUTH_PEPPER environment variable must be configured in production.');
  }

  return 'default-pepper-for-dev-only';
};

const AUTH_PEPPER = resolveAuthPepper();

// Legacy params retained for backward compatibility with existing hashes.
const LEGACY_SCRYPT_CONFIG = {
  N: 16384,
  r: 8,
  p: 1,
  keyLen: 64,
};

// Hardened params used for new password hashes.
const SCRYPT_CONFIG = {
  N: 32768,
  r: 8,
  p: 1,
  keyLen: 64,
  maxmem: 128 * 1024 * 1024,
};

const SCRYPT_HASH_PREFIX = 's2';

export interface EncryptedPayload {
  cipherText: string;
  iv: string;
  authTag: string;
  algorithm: 'aes-256-gcm';
  keyVersion: 'v1';
  salt?: string; // Added salt for scrypt
}

export type FileCipherAlgorithm = 'aes-256-gcm' | 'chacha20-poly1305';

export interface EncryptedEnvelopePayload {
  algorithm: FileCipherAlgorithm;
  iv: string;
  authTag: string;
  cipherText: string;
  wrappedDek: string;
  wrapIv: string;
  wrapTag: string;
  keyVersion: string;
  keyId: string;
}

const deriveScryptKey = (
  input: string,
  salt: string,
  config: {
    N: number;
    r: number;
    p: number;
    keyLen: number;
    maxmem?: number;
  },
): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    crypto.scrypt(
      input,
      salt,
      config.keyLen,
      {
        N: config.N,
        r: config.r,
        p: config.p,
        ...(config.maxmem ? { maxmem: config.maxmem } : {}),
      },
      (err, derivedKey) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(derivedKey as Buffer);
      },
    );
  });

/**
 * Hashes a password using scrypt and a server-side pepper.
 * Format: s2$N$r$p$keyLen$saltHex$hashHex
 */
export const hashPassword = async (plainTextPassword: string): Promise<string> => {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = await deriveScryptKey(plainTextPassword + AUTH_PEPPER, salt, SCRYPT_CONFIG);
  return [
    SCRYPT_HASH_PREFIX,
    SCRYPT_CONFIG.N,
    SCRYPT_CONFIG.r,
    SCRYPT_CONFIG.p,
    SCRYPT_CONFIG.keyLen,
    salt,
    derivedKey.toString('hex'),
  ].join('$');
};

/**
 * Compares a plain text password with a hash.
 * Supports both new scrypt hashes (salt:hash) and legacy bcrypt hashes.
 */
export const comparePassword = async (
  plainTextPassword: string,
  hashedPassword: string,
): Promise<boolean> => {
  if (!plainTextPassword || !hashedPassword) {
    return false;
  }

  // Legacy support for bcrypt hashes (usually start with $2a$ or $2b$)
  if (hashedPassword.startsWith('$2')) {
    return bcrypt.compare(plainTextPassword, hashedPassword);
  }

  const candidatePeppers = Array.from(
    new Set([AUTH_PEPPER, 'default-pepper-for-dev-only', '']),
  ).filter((p): p is string => typeof p === 'string');

  try {
    if (hashedPassword.startsWith(`${SCRYPT_HASH_PREFIX}$`)) {
      const parts = hashedPassword.split('$');
      if (parts.length !== 7) {
        return false;
      }

      const [, nRaw, rRaw, pRaw, keyLenRaw, salt, originalHash] = parts;
      const n = Number.parseInt(nRaw, 10);
      const r = Number.parseInt(rRaw, 10);
      const p = Number.parseInt(pRaw, 10);
      const keyLen = Number.parseInt(keyLenRaw, 10);
      if (!n || !r || !p || !keyLen || !salt || !originalHash) {
        return false;
      }

      const expectedBuffer = Buffer.from(originalHash, 'hex');
      if (expectedBuffer.length === 0) {
        return false;
      }

      for (const pepper of candidatePeppers) {
        const derivedKey = await deriveScryptKey(plainTextPassword + pepper, salt, {
          N: n,
          r,
          p,
          keyLen,
          maxmem: Math.max(128 * r * n + 1024, 128 * 1024 * 1024),
        });

        if (
          expectedBuffer.length === derivedKey.length &&
          crypto.timingSafeEqual(expectedBuffer, derivedKey)
        ) {
          return true;
        }
      }

      return false;
    }

    // Legacy "salt:hash" format.
    const [salt, originalHash] = hashedPassword.split(':');
    if (!salt || !originalHash) {
      return false;
    }

    const expectedBuffer = Buffer.from(originalHash, 'hex');
    if (expectedBuffer.length === 0) {
      return false;
    }

    for (const pepper of candidatePeppers) {
      const derivedKey = await deriveScryptKey(
        plainTextPassword + pepper,
        salt,
        LEGACY_SCRYPT_CONFIG,
      );
      if (
        expectedBuffer.length === derivedKey.length &&
        crypto.timingSafeEqual(expectedBuffer, derivedKey)
      ) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
};

export const encryptText = (value: string): EncryptedPayload => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    cipherText: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    algorithm: 'aes-256-gcm',
    keyVersion: 'v1',
  };
};

const getCandidateEncryptionKeys = (): Buffer[] => {
  const keys: Buffer[] = [encryptionKey];

  if (ENCRYPTION_KEY_SOURCE) {
    const shaHashed = crypto.createHash('sha256').update(ENCRYPTION_KEY_SOURCE).digest();
    if (!keys.some((k) => k.equals(shaHashed))) {
      keys.push(shaHashed);
    }
  }

  // Previous rotation key candidates
  const prevHexKey = Buffer.from(
    'd7917034d236dd3d2127be2dfbc3d734aca6e655e8524a1758baf8bb747138de',
    'hex',
  );
  if (!keys.some((k) => k.equals(prevHexKey))) {
    keys.push(prevHexKey);
  }

  const devKey = Buffer.from('0'.repeat(64), 'hex');
  if (!keys.some((k) => k.equals(devKey))) {
    keys.push(devKey);
  }

  const devKeyHashed = crypto.createHash('sha256').update('0'.repeat(64)).digest();
  if (!keys.some((k) => k.equals(devKeyHashed))) {
    keys.push(devKeyHashed);
  }

  return keys;
};

export const decryptText = (payload: EncryptedPayload): string => {
  const candidateKeys = getCandidateEncryptionKeys();
  let lastError: Error | null = null;

  for (const key of candidateKeys) {
    try {
      const decipher = crypto.createDecipheriv(
        payload.algorithm || 'aes-256-gcm',
        key,
        Buffer.from(payload.iv, 'base64'),
      );
      decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));

      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(payload.cipherText, 'base64')),
        decipher.final(),
      ]);

      return decrypted.toString('utf8');
    } catch (err) {
      lastError = err as Error;
    }
  }

  throw lastError || new Error('Decryption failed for all candidate keys');
};
const resolveBufferEncryptionKey = (masterKey?: string): Buffer => {
  if (!masterKey) {
    return encryptionKey;
  }

  return /^[a-f0-9]{64}$/i.test(masterKey)
    ? Buffer.from(masterKey, 'hex')
    : crypto.createHash('sha256').update(masterKey).digest();
};

const FILE_ENCRYPTION_ALGORITHM = (() => {
  const configured = process.env.FILE_ENCRYPTION_ALGORITHM?.trim().toLowerCase();
  if (configured === 'chacha20-poly1305') {
    return 'chacha20-poly1305' as const;
  }
  return 'aes-256-gcm' as const;
})();

const ENVELOPE_KEY_ID = process.env.ENVELOPE_KEY_ID?.trim() || 'local-kek-v1';
const ENVELOPE_KEY_VERSION = process.env.ENVELOPE_KEY_VERSION?.trim() || 'v1';
const REQUIRE_ENVELOPE_KEK_IN_PRODUCTION =
  (process.env.REQUIRE_ENVELOPE_KEK_IN_PRODUCTION?.trim().toLowerCase() || 'false') === 'true';

const resolveKekBuffer = (source: string): Buffer => {
  if (/^[a-f0-9]{64}$/i.test(source)) {
    return Buffer.from(source, 'hex');
  }

  try {
    const asBase64 = Buffer.from(source, 'base64');
    if (asBase64.length === 32) {
      return asBase64;
    }
  } catch {
    // no-op
  }

  return crypto.createHash('sha256').update(source).digest();
};

const resolveEnvelopeKekRing = (): Map<string, Buffer> => {
  const ring = new Map<string, Buffer>();
  const primarySource = process.env.ENVELOPE_KEK || process.env.KMS_ENVELOPE_KEK || '';
  if (primarySource) {
    ring.set(ENVELOPE_KEY_ID, resolveKekBuffer(primarySource));
  }
  const rawRing = process.env.ENVELOPE_KEK_RING_JSON?.trim();
  if (rawRing) {
    try {
      const parsed = JSON.parse(rawRing) as Record<string, string>;
      for (const [keyId, value] of Object.entries(parsed)) {
        if (keyId && typeof value === 'string' && value.trim()) {
          ring.set(keyId, resolveKekBuffer(value.trim()));
        }
      }
    } catch {
      throw new Error('ENVELOPE_KEK_RING_JSON must be valid JSON object.');
    }
  }
  if (
    process.env.NODE_ENV === 'production' &&
    REQUIRE_ENVELOPE_KEK_IN_PRODUCTION &&
    ring.size === 0
  ) {
    throw new Error(
      'ENVELOPE_KEK (or KMS_ENVELOPE_KEK / ENVELOPE_KEK_RING_JSON) must be set in production.',
    );
  }
  if (ring.size === 0) {
    ring.set(ENVELOPE_KEY_ID, Buffer.from('1'.repeat(64), 'hex'));
  }
  return ring;
};

const envelopeKekRing = resolveEnvelopeKekRing();

const resolveEnvelopeKek = (): Buffer => {
  const source = process.env.ENVELOPE_KEK || process.env.KMS_ENVELOPE_KEK || '';

  if (!source && process.env.NODE_ENV === 'production' && REQUIRE_ENVELOPE_KEK_IN_PRODUCTION) {
    throw new Error('ENVELOPE_KEK (or KMS_ENVELOPE_KEK) must be set in production.');
  }

  if (!source) {
    return Buffer.from('1'.repeat(64), 'hex');
  }
  return resolveKekBuffer(source);
};

const envelopeKek = resolveEnvelopeKek();

const encryptWithAlgorithm = (buffer: Buffer, key: Buffer, algorithm: FileCipherAlgorithm) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(algorithm, key, iv) as crypto.CipherGCM;
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { encrypted, iv, authTag };
};

const decryptWithAlgorithm = (
  cipherText: Buffer,
  key: Buffer,
  algorithm: FileCipherAlgorithm,
  iv: Buffer,
  authTag: Buffer,
) => {
  const decipher = crypto.createDecipheriv(algorithm, key, iv) as crypto.DecipherGCM;
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(cipherText), decipher.final()]);
};

export const encryptBufferEnvelope = (
  buffer: Buffer,
  algorithm: FileCipherAlgorithm = FILE_ENCRYPTION_ALGORITHM,
): EncryptedEnvelopePayload => {
  const dek = crypto.randomBytes(32);
  const fileCipher = encryptWithAlgorithm(buffer, dek, algorithm);
  const wrappedDekPayload = encryptWithAlgorithm(dek, envelopeKek, 'aes-256-gcm');

  return {
    algorithm,
    iv: fileCipher.iv.toString('base64'),
    authTag: fileCipher.authTag.toString('base64'),
    cipherText: fileCipher.encrypted.toString('base64'),
    wrappedDek: wrappedDekPayload.encrypted.toString('base64'),
    wrapIv: wrappedDekPayload.iv.toString('base64'),
    wrapTag: wrappedDekPayload.authTag.toString('base64'),
    keyVersion: ENVELOPE_KEY_VERSION,
    keyId: ENVELOPE_KEY_ID,
  };
};

export const decryptBufferEnvelope = (payload: EncryptedEnvelopePayload): Buffer => {
  const kekForPayload = envelopeKekRing.get(payload.keyId) || envelopeKek;
  const dek = decryptWithAlgorithm(
    Buffer.from(payload.wrappedDek, 'base64'),
    kekForPayload,
    'aes-256-gcm',
    Buffer.from(payload.wrapIv, 'base64'),
    Buffer.from(payload.wrapTag, 'base64'),
  );

  return decryptWithAlgorithm(
    Buffer.from(payload.cipherText, 'base64'),
    dek,
    payload.algorithm,
    Buffer.from(payload.iv, 'base64'),
    Buffer.from(payload.authTag, 'base64'),
  );
};

export const rewrapEnvelopeDek = (
  payload: Omit<EncryptedEnvelopePayload, 'cipherText'> & { cipherText?: string },
  targetKeyId = ENVELOPE_KEY_ID,
): Omit<EncryptedEnvelopePayload, 'cipherText'> & { cipherText?: string } => {
  const sourceKek = envelopeKekRing.get(payload.keyId);
  if (!sourceKek) {
    throw new Error(`Unknown source envelope key id: ${payload.keyId}`);
  }
  const targetKek = envelopeKekRing.get(targetKeyId);
  if (!targetKek) {
    throw new Error(`Unknown target envelope key id: ${targetKeyId}`);
  }
  const dek = decryptWithAlgorithm(
    Buffer.from(payload.wrappedDek, 'base64'),
    sourceKek,
    'aes-256-gcm',
    Buffer.from(payload.wrapIv, 'base64'),
    Buffer.from(payload.wrapTag, 'base64'),
  );
  const rewrapped = encryptWithAlgorithm(dek, targetKek, 'aes-256-gcm');
  return {
    ...payload,
    wrappedDek: rewrapped.encrypted.toString('base64'),
    wrapIv: rewrapped.iv.toString('base64'),
    wrapTag: rewrapped.authTag.toString('base64'),
    keyId: targetKeyId,
    keyVersion: ENVELOPE_KEY_VERSION,
  };
};

export const encryptBuffer = (
  buffer: Buffer,
  masterKey?: string,
): { iv: string; tag: string; encryptedData: string } => {
  const iv = crypto.randomBytes(12);
  const keyBuffer = resolveBufferEncryptionKey(masterKey);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    iv: iv.toString('hex'),
    tag: authTag.toString('hex'),
    encryptedData: encrypted.toString('hex'),
  };
};

export const decryptBuffer = (
  payload:
    | { iv: string; tag: string; encryptedData: string }
    | {
        iv: string;
        authTag: string;
        cipherText: string;
        algorithm?: 'aes-256-gcm';
        keyVersion?: 'v1';
      },
  masterKey?: string,
): Buffer => {
  const keyBuffer = resolveBufferEncryptionKey(masterKey);
  const authTag = 'tag' in payload ? payload.tag : payload.authTag;
  const encryptedData = 'encryptedData' in payload ? payload.encryptedData : payload.cipherText;
  const encoding = 'encryptedData' in payload ? 'hex' : 'base64';
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    keyBuffer,
    Buffer.from(payload.iv, encoding === 'hex' ? 'hex' : 'base64'),
  );
  decipher.setAuthTag(Buffer.from(authTag, encoding === 'hex' ? 'hex' : 'base64'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedData, encoding)),
    decipher.final(),
  ]);

  return decrypted;
};

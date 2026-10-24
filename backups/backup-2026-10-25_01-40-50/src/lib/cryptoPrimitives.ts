import { argon2id } from 'hash-wasm';

export const AES_GCM_IV_LENGTH = 12;
export const CHACHA20_NONCE_LENGTH = 12;
const ARGON2_MEMORY = 65536;
const ARGON2_ITERATIONS = 3;
const ARGON2_PARALLELISM = 4;
const ARGON2_HASH_LENGTH = 32;
export const KEY_BYTE_LENGTH = 32;
export const CASCADE_DEK_BYTES = 64; // 32 bytes AES-256 DEK + 32 bytes ChaCha20-Poly1305 DEK
export const CASCADE_ENC_DEK_LENGTH = 80; // 64 bytes DEKs + 16 bytes AES-GCM auth tag
export const AES_GCM_AAD = new TextEncoder().encode('vault:e2ee:aes-gcm:v2');
export const CHACHA_AAD = new TextEncoder().encode('vault:e2ee:chacha20-poly1305:v1');
export const CASCADE_DEK_AAD = new TextEncoder().encode('vault:dek:cascade-gcm:v1');
export const DEK_AAD = new TextEncoder().encode('vault:dek:aes-gcm:v2');

// Magic Identifiers
export const ENVELOPE_MAGIC_CASCADE = new Uint8Array([0x56, 0x43, 0x41, 0x53, 0x30, 0x31]); // "VCAS01"
export const ENVELOPE_MAGIC_V2 = new Uint8Array([0x56, 0x45, 0x4e, 0x56, 0x30, 0x32]); // "VENV02"
export const ENVELOPE_MAGIC = ENVELOPE_MAGIC_CASCADE; // Default to VCAS01 for new encryptions

export const CASCADE_HEADER_LENGTH =
  ENVELOPE_MAGIC_CASCADE.length +
  AES_GCM_IV_LENGTH +
  CASCADE_ENC_DEK_LENGTH +
  AES_GCM_IV_LENGTH +
  CHACHA20_NONCE_LENGTH; // 6 + 12 + 80 + 12 + 12 = 122 bytes
export const ENVELOPE_HEADER_LENGTH = 6 + AES_GCM_IV_LENGTH + 48 + AES_GCM_IV_LENGTH; // 78 bytes for VENV02

const toArrayBuffer = (value: Uint8Array): ArrayBuffer => new Uint8Array(value).buffer;

let sodiumInstance: any = null;
let sodiumPromise: Promise<any> | null = null;

export const getSodium = async () => {
  if (sodiumInstance) return sodiumInstance;
  if (!sodiumPromise) {
    sodiumPromise = (async () => {
      const sodiumModule = await import('libsodium-wrappers');
      const sodium = sodiumModule.default || sodiumModule;
      await sodium.ready;
      sodiumInstance = sodium;
      return sodium;
    })();
  }
  return sodiumPromise;
};

/**
 * ChaCha20-Poly1305 IETF Authenticated Encryption
 */
export const encryptChaCha20Poly1305 = async (
  plaintext: Uint8Array,
  key: Uint8Array,
  nonce?: Uint8Array,
  aad?: Uint8Array,
): Promise<{ ciphertext: Uint8Array; nonce: Uint8Array }> => {
  const sodium = await getSodium();
  const fileNonce = nonce || crypto.getRandomValues(new Uint8Array(CHACHA20_NONCE_LENGTH));
  const ciphertext = sodium.crypto_aead_chacha20poly1305_ietf_encrypt(
    plaintext,
    aad || null,
    null,
    fileNonce,
    key,
  );
  return { ciphertext: new Uint8Array(ciphertext), nonce: fileNonce };
};

/**
 * ChaCha20-Poly1305 IETF Authenticated Decryption
 */
export const decryptChaCha20Poly1305 = async (
  ciphertext: Uint8Array,
  key: Uint8Array,
  nonce: Uint8Array,
  aad?: Uint8Array,
): Promise<Uint8Array> => {
  const sodium = await getSodium();
  try {
    const decrypted = sodium.crypto_aead_chacha20poly1305_ietf_decrypt(
      null,
      ciphertext,
      aad || null,
      nonce,
      key,
    );
    return new Uint8Array(decrypted);
  } catch {
    // Fallback without AAD
    const decrypted = sodium.crypto_aead_chacha20poly1305_ietf_decrypt(
      null,
      ciphertext,
      null,
      nonce,
      key,
    );
    return new Uint8Array(decrypted);
  }
};

const decryptAesGcmWithFallback = async (
  cryptoKey: CryptoKey,
  iv: Uint8Array,
  ciphertext: Uint8Array,
): Promise<ArrayBuffer> => {
  try {
    return await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: toArrayBuffer(iv),
        additionalData: toArrayBuffer(AES_GCM_AAD),
      },
      cryptoKey,
      toArrayBuffer(ciphertext),
    );
  } catch {
    return await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(iv) },
      cryptoKey,
      toArrayBuffer(ciphertext),
    );
  }
};

export const uint8ArrayToBase64 = (array: Uint8Array): string => {
  const chunkSize = 0x8000;
  let binaryString = '';
  for (let i = 0; i < array.length; i += chunkSize) {
    binaryString += String.fromCharCode(...(array.subarray(i, i + chunkSize) as any));
  }
  return btoa(binaryString);
};

const normalizeBase64Input = (value: string): string => {
  if (!value || typeof value !== 'string') return '';
  let normalized = value.trim();
  if (!normalized) {
    return '';
  }

  if (normalized.includes('%')) {
    try {
      normalized = decodeURIComponent(normalized);
    } catch {
      // Keep original value when URI decoding fails.
    }
  }

  if (normalized.startsWith('V2_ENC:')) {
    normalized = normalized.substring(7).trim();
  }

  // Handle data URL payloads and strip whitespace/newlines.
  const dataUrlMatch = normalized.match(/^data:[^,]*;base64,(.*)$/i);
  if (dataUrlMatch) {
    normalized = dataUrlMatch[1];
  }

  normalized = normalized.replace(/\s+/g, '');

  // Accept URL-safe Base64 variants.
  normalized = normalized.replace(/-/g, '+').replace(/_/g, '/');

  const remainder = normalized.length % 4;
  if (remainder === 2) {
    normalized += '==';
  } else if (remainder === 3) {
    normalized += '=';
  } else if (remainder === 1) {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
};

export const base64ToUint8Array = (base64: string): Uint8Array => {
  if (!base64 || typeof base64 !== 'string') return new Uint8Array(0);
  try {
    const normalized = normalizeBase64Input(base64);
    if (!normalized) return new Uint8Array(0);
    // For smaller strings, perform strict validation; for large payloads let atob safely parse
    if (normalized.length < 2048 && !/^[A-Za-z0-9+/=]+$/.test(normalized)) {
      return new Uint8Array(0);
    }

    const binaryString = atob(normalized);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  } catch {
    return new Uint8Array(0);
  }
};

/**
 * 60-Second Inactivity RAM Key Shredder (Cold Boot / Anti-RAM Dump Defense)
 */
export const CRYPTO_KEY_CACHE_TTL_MS = 60_000;

const cryptoKeyCache = new Map<string, CryptoKey>();
let cryptoKeyInactivityTimer: ReturnType<typeof setTimeout> | null = null;
let lastCryptoAccessTime = Date.now();

export const clearCryptoKeyCache = (): void => {
  if (cryptoKeyInactivityTimer) {
    clearTimeout(cryptoKeyInactivityTimer);
    cryptoKeyInactivityTimer = null;
  }
  cryptoKeyCache.clear();
};

export const touchCryptoKeyCache = (): void => {
  lastCryptoAccessTime = Date.now();
  if (cryptoKeyCache.size === 0) {
    return;
  }
  if (cryptoKeyInactivityTimer) {
    clearTimeout(cryptoKeyInactivityTimer);
  }
  cryptoKeyInactivityTimer = setTimeout(() => {
    const elapsed = Date.now() - lastCryptoAccessTime;
    if (elapsed >= CRYPTO_KEY_CACHE_TTL_MS) {
      clearCryptoKeyCache();
    } else {
      touchCryptoKeyCache();
    }
  }, CRYPTO_KEY_CACHE_TTL_MS);
};

export const getOrCreateCryptoKey = async (
  secretKey: string | CryptoKey,
): Promise<CryptoKey | null> => {
  touchCryptoKeyCache();
  if (secretKey instanceof CryptoKey) {
    return secretKey;
  }
  const cached = cryptoKeyCache.get(secretKey);
  if (cached) {
    touchCryptoKeyCache();
    return cached;
  }

  try {
    const keyBuf = base64ToUint8Array(secretKey);
    if (keyBuf.length !== KEY_BYTE_LENGTH) {
      return null;
    }

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      toArrayBuffer(keyBuf),
      { name: 'AES-GCM' },
      false, // non-extractable
      ['encrypt', 'decrypt'],
    );

    // Secure zero-out of raw key buffer immediately after import
    keyBuf.fill(0);

    cryptoKeyCache.set(secretKey, cryptoKey);
    touchCryptoKeyCache();
    return cryptoKey;
  } catch {
    return null;
  }
};

export const encryptData = async (
  data: string,
  secretKey: string | CryptoKey | null | undefined,
): Promise<string> => {
  touchCryptoKeyCache();
  if (data == null) return '';
  if (secretKey === null || secretKey === undefined) {
    // In decoy mode without master key, return data directly without throwing
    return data;
  }

  if (typeof secretKey === 'string') {
    const keyBuf = base64ToUint8Array(secretKey);
    if (keyBuf.length !== KEY_BYTE_LENGTH) {
      throw new Error('Invalid key length: key must be 32 bytes (256 bits)');
    }
  }

  const enc = new TextEncoder();
  const cryptoKey = await getOrCreateCryptoKey(secretKey);
  if (!cryptoKey) {
    throw new Error('Invalid encryption key');
  }

  const iv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_LENGTH));
  const dataBytes = enc.encode(data);

  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(iv),
      additionalData: toArrayBuffer(AES_GCM_AAD),
    },
    cryptoKey,
    toArrayBuffer(dataBytes),
  );

  // Secure zero-out of plaintext data buffer
  dataBytes.fill(0);

  const bundle = new Uint8Array(iv.length + ciphertext.byteLength);
  bundle.set(iv);
  bundle.set(new Uint8Array(ciphertext), iv.length);
  return uint8ArrayToBase64(bundle);
};

export const decryptData = async (
  encryptedBundle: string,
  secretKey: string | CryptoKey | null | undefined,
): Promise<string | null> => {
  touchCryptoKeyCache();
  if (!encryptedBundle) {
    return null;
  }

  // In decoy mode or when secretKey is null/undefined, return unencrypted plaintext directly
  if (secretKey === null || secretKey === undefined) {
    return encryptedBundle;
  }
  if (typeof secretKey === 'string' && !secretKey) {
    return null;
  }

  try {
    const bundle = base64ToUint8Array(encryptedBundle);
    if (bundle.length < AES_GCM_IV_LENGTH + 1) {
      return null;
    }

    const iv = bundle.slice(0, AES_GCM_IV_LENGTH);
    const ciphertext = bundle.slice(AES_GCM_IV_LENGTH);

    const cryptoKey = await getOrCreateCryptoKey(secretKey);
    if (!cryptoKey) {
      return null;
    }

    const decrypted = await decryptAesGcmWithFallback(cryptoKey, iv, ciphertext);
    const decoded = new TextDecoder().decode(decrypted);

    // Secure zero-out of decrypted plaintext buffer
    new Uint8Array(decrypted).fill(0);

    return decoded;
  } catch {
    // If decryption fails, return null
    return null;
  }
};

export const isCascadeBundle = (bundle: Uint8Array): boolean => {
  if (!bundle || bundle.length < CASCADE_HEADER_LENGTH) return false;
  for (let i = 0; i < ENVELOPE_MAGIC_CASCADE.length; i++) {
    if (bundle[i] !== ENVELOPE_MAGIC_CASCADE[i]) return false;
  }
  return true;
};

export const isEnvelopeBundle = (bundle: Uint8Array): boolean => {
  if (!bundle || bundle.length < ENVELOPE_HEADER_LENGTH) return false;
  if (isCascadeBundle(bundle)) return true;
  for (let i = 0; i < ENVELOPE_MAGIC_V2.length; i++) {
    if (bundle[i] !== ENVELOPE_MAGIC_V2[i]) return false;
  }
  return true;
};

const deriveKeyWithWorker = (password: string, salt: string): Promise<string> => {
  if (typeof Worker === 'undefined') {
    return Promise.reject(new Error('Web Workers are not available in this environment'));
  }

  return new Promise<string>((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('../workers/derive-key.worker.ts', import.meta.url), {
        type: 'module',
      });
    } catch (err) {
      reject(err);
      return;
    }

    worker.onmessage = (event) => {
      const data = event.data as { ok: true; hashBase64: string } | { ok: false; error: string };

      if (data.ok) {
        resolve(data.hashBase64);
      } else {
        reject(new Error(data.error));
      }
      worker.terminate();
    };

    worker.onerror = (event) => {
      reject(new Error((event as ErrorEvent)?.message || 'Key derivation worker failed'));
      worker.terminate();
    };

    worker.postMessage({
      password,
      salt,
      iterations: ARGON2_ITERATIONS,
      memorySize: ARGON2_MEMORY,
      parallelism: ARGON2_PARALLELISM,
      hashLength: ARGON2_HASH_LENGTH,
    });
  });
};

const deriveKeyDirect = async (password: string, salt: string): Promise<string> => {
  const saltBuf = new TextEncoder().encode(salt.padEnd(32, '0').slice(0, 32));
  const hash = await argon2id({
    password,
    salt: saltBuf,
    iterations: ARGON2_ITERATIONS,
    memorySize: ARGON2_MEMORY,
    parallelism: ARGON2_PARALLELISM,
    hashLength: ARGON2_HASH_LENGTH,
    outputType: 'binary',
  });
  const base64 = uint8ArrayToBase64(hash);
  hash.fill(0);
  saltBuf.fill(0);
  return base64;
};

export const deriveKey = async (password: string, salt: string): Promise<string> => {
  if (!password) throw new Error('Password required for key derivation');
  if (!salt || typeof salt !== 'string' || salt.trim().length < 8) {
    throw new Error(
      'Secure cryptographic salt (at least 8 characters) is required for key derivation',
    );
  }

  try {
    return await deriveKeyWithWorker(password, salt);
  } catch (workerErr) {
    const isTestRuntime =
      import.meta.env?.MODE === 'test' ||
      (typeof globalThis !== 'undefined' &&
        (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
          ?.NODE_ENV === 'test');
    if (!isTestRuntime) {
      console.warn('[Crypto] Key derivation worker unavailable, using direct KDF:', workerErr);
    }
    return await deriveKeyDirect(password, salt);
  }
};

/**
 * Dual-Engine Cascade Cipher File Encryption (AES-256-GCM + ChaCha20-Poly1305)
 */
export const encryptFileEnvelope = async (
  data: Uint8Array | ArrayBuffer,
  masterKey: string | CryptoKey,
): Promise<Uint8Array> => {
  touchCryptoKeyCache();
  const kekCryptoKey = await getOrCreateCryptoKey(masterKey);
  if (!kekCryptoKey) {
    throw new Error('Failed to import cryptographic master key (KEK)');
  }

  // 1. Generate 64 bytes cryptographically random DEK (32B AES-GCM + 32B ChaCha20-Poly1305)
  const dekBytes = crypto.getRandomValues(new Uint8Array(CASCADE_DEK_BYTES));
  const dekAesBytes = new Uint8Array(dekBytes.buffer, dekBytes.byteOffset, 32);
  const dekChaChaBytes = new Uint8Array(dekBytes.buffer, dekBytes.byteOffset + 32, 32);

  const dekAesCryptoKey = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(dekAesBytes),
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  );

  const rawData =
    data instanceof Uint8Array
      ? data
      : ArrayBuffer.isView(data)
        ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
        : new Uint8Array(data);

  // 2. Layer 1 (Inner): Encrypt File data with AES-256-GCM
  const fileAesIv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_LENGTH));
  const fileAesCiphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(fileAesIv),
      additionalData: toArrayBuffer(AES_GCM_AAD),
    },
    dekAesCryptoKey,
    toArrayBuffer(rawData),
  );
  const aesCipherBytes = new Uint8Array(fileAesCiphertext);

  // 3. Layer 2 (Outer): Encrypt AES ciphertext with ChaCha20-Poly1305 (Cascade Lock)
  const fileChaChaNonce = crypto.getRandomValues(new Uint8Array(CHACHA20_NONCE_LENGTH));
  const { ciphertext: cascadeCiphertext } = await encryptChaCha20Poly1305(
    aesCipherBytes,
    dekChaChaBytes,
    fileChaChaNonce,
    CHACHA_AAD,
  );

  // Shred intermediate AES ciphertext buffer
  aesCipherBytes.fill(0);

  // 4. Encrypt Dual DEKs (64 bytes) with KEK (Master Key)
  const kekIv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_LENGTH));
  const encryptedDek = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(kekIv),
      additionalData: toArrayBuffer(CASCADE_DEK_AAD),
    },
    kekCryptoKey,
    toArrayBuffer(dekBytes),
  );

  // Secure zero-out of plain DEK buffer immediately after encryption
  dekBytes.fill(0);

  const encDekBytes = new Uint8Array(encryptedDek);

  // 5. Assemble Cascade Bundle (VCAS01)
  const bundle = new Uint8Array(
    ENVELOPE_MAGIC_CASCADE.length +
      kekIv.length +
      encDekBytes.length +
      fileAesIv.length +
      fileChaChaNonce.length +
      cascadeCiphertext.length,
  );
  let offset = 0;
  bundle.set(ENVELOPE_MAGIC_CASCADE, offset);
  offset += ENVELOPE_MAGIC_CASCADE.length;
  bundle.set(kekIv, offset);
  offset += kekIv.length;
  bundle.set(encDekBytes, offset);
  offset += encDekBytes.length;
  bundle.set(fileAesIv, offset);
  offset += fileAesIv.length;
  bundle.set(fileChaChaNonce, offset);
  offset += fileChaChaNonce.length;
  bundle.set(cascadeCiphertext, offset);

  return bundle;
};

/**
 * Ultra-Fast Hardware-Accelerated AES-256-GCM Envelope Encryption (VENV02).
 * Designed for large media and videos where software ChaCha20 causes severe CPU bottleneck.
 * Utilizes native Web Crypto API with hardware AES-NI instructions (~3 GB/s throughput).
 */
export const encryptFileEnvelopeFast = async (
  data: BufferSource | Uint8Array,
  masterKey: string | CryptoKey,
): Promise<Uint8Array> => {
  touchCryptoKeyCache();
  const kekCryptoKey = await getOrCreateCryptoKey(masterKey);
  if (!kekCryptoKey) {
    throw new Error('Failed to import master key (KEK)');
  }

  // 1. Generate 32-byte DEK (Hardware AES-256-GCM)
  const dekBytes = crypto.getRandomValues(new Uint8Array(32));
  const dekCryptoKey = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(dekBytes),
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  );

  const rawData =
    data instanceof Uint8Array
      ? data
      : ArrayBuffer.isView(data)
        ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
        : new Uint8Array(data);

  // 2. Encrypt File data with AES-256-GCM (Hardware accelerated AES-NI)
  const fileAesIv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_LENGTH));
  const fileAesCiphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(fileAesIv),
      additionalData: toArrayBuffer(AES_GCM_AAD),
    },
    dekCryptoKey,
    toArrayBuffer(rawData),
  );
  const encFileBytes = new Uint8Array(fileAesCiphertext);

  // 3. Encrypt DEK (32 bytes) with KEK (Master Key) -> 48 bytes output
  const kekIv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_LENGTH));
  const encryptedDek = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(kekIv),
      additionalData: toArrayBuffer(DEK_AAD),
    },
    kekCryptoKey,
    toArrayBuffer(dekBytes),
  );

  // Secure zero-out plain DEK buffer immediately after encryption
  dekBytes.fill(0);

  const encDekBytes = new Uint8Array(encryptedDek);

  // 4. Assemble VENV02 Bundle:
  // [6B VENV02] + [12B KEK IV] + [48B Encrypted DEK] + [12B File AES IV] + [Ciphertext]
  const bundle = new Uint8Array(
    ENVELOPE_MAGIC_V2.length +
      kekIv.length +
      encDekBytes.length +
      fileAesIv.length +
      encFileBytes.length,
  );
  let offset = 0;
  bundle.set(ENVELOPE_MAGIC_V2, offset);
  offset += ENVELOPE_MAGIC_V2.length;
  bundle.set(kekIv, offset);
  offset += kekIv.length;
  bundle.set(encDekBytes, offset);
  offset += encDekBytes.length;
  bundle.set(fileAesIv, offset);
  offset += fileAesIv.length;
  bundle.set(encFileBytes, offset);

  return bundle;
};

/**
 * Dual-Engine Cascade Cipher File Decryption (with VENV02 and legacy fallback)
 */
export const decryptFileEnvelope = async (
  bundle: Uint8Array,
  masterKey: string | CryptoKey,
): Promise<ArrayBuffer> => {
  touchCryptoKeyCache();

  // 1. Dual-Engine Cascade Envelope (VCAS01)
  if (isCascadeBundle(bundle)) {
    const kekCryptoKey = await getOrCreateCryptoKey(masterKey);
    if (!kekCryptoKey) {
      throw new Error('Failed to import master key (KEK)');
    }

    let offset = ENVELOPE_MAGIC_CASCADE.length;
    const kekIv = bundle.subarray(offset, offset + AES_GCM_IV_LENGTH);
    offset += AES_GCM_IV_LENGTH;

    const encDekBytes = bundle.subarray(offset, offset + CASCADE_ENC_DEK_LENGTH);
    offset += CASCADE_ENC_DEK_LENGTH;

    const fileAesIv = bundle.subarray(offset, offset + AES_GCM_IV_LENGTH);
    offset += AES_GCM_IV_LENGTH;

    const fileChaChaNonce = bundle.subarray(offset, offset + CHACHA20_NONCE_LENGTH);
    offset += CHACHA20_NONCE_LENGTH;

    const cascadeCiphertext = bundle.subarray(offset);

    // Decrypt Dual DEKs with KEK
    let decryptedDekBuf: ArrayBuffer;
    try {
      decryptedDekBuf = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: toArrayBuffer(kekIv),
          additionalData: toArrayBuffer(CASCADE_DEK_AAD),
        },
        kekCryptoKey,
        toArrayBuffer(encDekBytes),
      );
    } catch {
      decryptedDekBuf = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: toArrayBuffer(kekIv),
          additionalData: toArrayBuffer(DEK_AAD),
        },
        kekCryptoKey,
        toArrayBuffer(encDekBytes),
      );
    }

    const dekBytes = new Uint8Array(decryptedDekBuf);
    const dekAesBytes = dekBytes.subarray(0, 32);
    const dekChaChaBytes = dekBytes.subarray(32, 64);

    let innerAesCiphertext: Uint8Array | null = null;
    let decryptedFileBuf: ArrayBuffer | null = null;

    try {
      // Layer 1 (Outer): Decrypt with ChaCha20-Poly1305
      innerAesCiphertext = await decryptChaCha20Poly1305(
        cascadeCiphertext,
        dekChaChaBytes,
        fileChaChaNonce,
        CHACHA_AAD,
      );

      // Layer 2 (Inner): Decrypt with AES-256-GCM
      const dekAesCryptoKey = await crypto.subtle.importKey(
        'raw',
        toArrayBuffer(dekAesBytes),
        { name: 'AES-GCM' },
        false,
        ['decrypt'],
      );

      decryptedFileBuf = await decryptAesGcmWithFallback(
        dekAesCryptoKey,
        fileAesIv,
        innerAesCiphertext,
      );
      return decryptedFileBuf;
    } finally {
      // Aggressive Memory Key Shredder: Zero out all intermediate buffers and keys immediately
      dekBytes.fill(0);
      if (innerAesCiphertext) {
        innerAesCiphertext.fill(0);
      }
    }
  }

  // 2. Backward Compatibility: Single-layer AES-256-GCM Envelope (VENV02)
  if (isEnvelopeBundle(bundle)) {
    const kekCryptoKey = await getOrCreateCryptoKey(masterKey);
    if (!kekCryptoKey) {
      throw new Error('Failed to import master key (KEK)');
    }

    let offset = ENVELOPE_MAGIC_V2.length;
    const kekIv = bundle.subarray(offset, offset + AES_GCM_IV_LENGTH);
    offset += AES_GCM_IV_LENGTH;

    const encDekBytes = bundle.subarray(offset, offset + 48);
    offset += 48;

    const fileIv = bundle.subarray(offset, offset + AES_GCM_IV_LENGTH);
    offset += AES_GCM_IV_LENGTH;

    const encFileBytes = bundle.subarray(offset);

    // Decrypt DEK with KEK
    const decryptedDekBuf = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: toArrayBuffer(kekIv),
        additionalData: toArrayBuffer(DEK_AAD),
      },
      kekCryptoKey,
      toArrayBuffer(encDekBytes),
    );

    const dekCryptoKey = await crypto.subtle.importKey(
      'raw',
      decryptedDekBuf,
      { name: 'AES-GCM' },
      false,
      ['decrypt'],
    );

    // Secure zero-out DEK buffer
    new Uint8Array(decryptedDekBuf).fill(0);

    // Decrypt File data with DEK
    return await decryptAesGcmWithFallback(dekCryptoKey, fileIv, encFileBytes);
  }

  // 3. Backward Compatibility: Fallback for legacy direct AES-GCM bundle
  const cryptoKey = await getOrCreateCryptoKey(masterKey);
  if (!cryptoKey) {
    throw new Error('Failed to import cryptographic key');
  }
  const iv = bundle.slice(0, AES_GCM_IV_LENGTH);
  const ciphertext = bundle.slice(AES_GCM_IV_LENGTH);
  return await decryptAesGcmWithFallback(cryptoKey, iv, ciphertext);
};

export const rotateItemEnvelopeKey = async (
  bundle: Uint8Array,
  oldMasterKey: string | CryptoKey,
  newMasterKey: string | CryptoKey,
): Promise<Uint8Array> => {
  touchCryptoKeyCache();

  // 1. Rotate Cascade Envelope (VCAS01)
  if (isCascadeBundle(bundle)) {
    const oldKekCryptoKey = await getOrCreateCryptoKey(oldMasterKey);
    const newKekCryptoKey = await getOrCreateCryptoKey(newMasterKey);
    if (!oldKekCryptoKey || !newKekCryptoKey) {
      throw new Error('Failed to import master keys for cascade envelope rotation');
    }

    let offset = ENVELOPE_MAGIC_CASCADE.length;
    const oldKekIv = bundle.subarray(offset, offset + AES_GCM_IV_LENGTH);
    offset += AES_GCM_IV_LENGTH;

    const encDekBytes = bundle.subarray(offset, offset + CASCADE_ENC_DEK_LENGTH);
    offset += CASCADE_ENC_DEK_LENGTH;

    const remainingPayload = bundle.subarray(offset);

    let decryptedDekBuf: ArrayBuffer;
    try {
      decryptedDekBuf = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: toArrayBuffer(oldKekIv),
          additionalData: toArrayBuffer(CASCADE_DEK_AAD),
        },
        oldKekCryptoKey,
        toArrayBuffer(encDekBytes),
      );
    } catch {
      decryptedDekBuf = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: toArrayBuffer(oldKekIv),
          additionalData: toArrayBuffer(DEK_AAD),
        },
        oldKekCryptoKey,
        toArrayBuffer(encDekBytes),
      );
    }

    const newKekIv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_LENGTH));
    const newEncryptedDek = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: toArrayBuffer(newKekIv),
        additionalData: toArrayBuffer(CASCADE_DEK_AAD),
      },
      newKekCryptoKey,
      decryptedDekBuf,
    );

    new Uint8Array(decryptedDekBuf).fill(0);

    const newEncDekBytes = new Uint8Array(newEncryptedDek);

    const rotatedBundle = new Uint8Array(
      ENVELOPE_MAGIC_CASCADE.length +
        newKekIv.length +
        newEncDekBytes.length +
        remainingPayload.length,
    );
    let roffset = 0;
    rotatedBundle.set(ENVELOPE_MAGIC_CASCADE, roffset);
    roffset += ENVELOPE_MAGIC_CASCADE.length;
    rotatedBundle.set(newKekIv, roffset);
    roffset += newKekIv.length;
    rotatedBundle.set(newEncDekBytes, roffset);
    roffset += newEncDekBytes.length;
    rotatedBundle.set(remainingPayload, roffset);

    return rotatedBundle;
  }

  // 2. Rotate legacy VENV02 Envelope
  if (isEnvelopeBundle(bundle)) {
    const oldKekCryptoKey = await getOrCreateCryptoKey(oldMasterKey);
    const newKekCryptoKey = await getOrCreateCryptoKey(newMasterKey);
    if (!oldKekCryptoKey || !newKekCryptoKey) {
      throw new Error('Failed to import master keys for envelope rotation');
    }

    let offset = ENVELOPE_MAGIC_V2.length;
    const oldKekIv = bundle.subarray(offset, offset + AES_GCM_IV_LENGTH);
    offset += AES_GCM_IV_LENGTH;

    const encDekBytes = bundle.subarray(offset, offset + 48);
    offset += 48;

    const remainingPayload = bundle.subarray(offset);

    const decryptedDekBuf = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: toArrayBuffer(oldKekIv),
        additionalData: toArrayBuffer(DEK_AAD),
      },
      oldKekCryptoKey,
      toArrayBuffer(encDekBytes),
    );

    const newKekIv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_LENGTH));
    const newEncryptedDek = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: toArrayBuffer(newKekIv),
        additionalData: toArrayBuffer(DEK_AAD),
      },
      newKekCryptoKey,
      decryptedDekBuf,
    );

    new Uint8Array(decryptedDekBuf).fill(0);

    const newEncDekBytes = new Uint8Array(newEncryptedDek);

    const rotatedBundle = new Uint8Array(
      ENVELOPE_MAGIC_V2.length + newKekIv.length + newEncDekBytes.length + remainingPayload.length,
    );
    let roffset = 0;
    rotatedBundle.set(ENVELOPE_MAGIC_V2, roffset);
    roffset += ENVELOPE_MAGIC_V2.length;
    rotatedBundle.set(newKekIv, roffset);
    roffset += newKekIv.length;
    rotatedBundle.set(newEncDekBytes, roffset);
    roffset += newEncDekBytes.length;
    rotatedBundle.set(remainingPayload, roffset);

    return rotatedBundle;
  }

  // 3. Legacy item: full decrypt & re-encrypt as Cascade envelope
  const decrypted = await decryptFileEnvelope(bundle, oldMasterKey);
  const decryptedBytes = new Uint8Array(decrypted);
  try {
    return await encryptFileEnvelope(decryptedBytes, newMasterKey);
  } finally {
    decryptedBytes.fill(0);
  }
};

export const encryptFile = async (
  file: File | Blob | Uint8Array,
  secretKey: string | CryptoKey,
): Promise<Uint8Array> => {
  const arrayBuffer = file instanceof Uint8Array ? file : await file.arrayBuffer();
  return encryptFileEnvelope(arrayBuffer, secretKey);
};

export const encryptFileInWorker = async (
  file: File | Blob,
  secretKey: string | CryptoKey,
  options?: { fastHardware?: boolean },
): Promise<Uint8Array> => {
  if (options?.fastHardware) {
    const fileBuffer = await file.arrayBuffer();
    return encryptFileEnvelopeFast(fileBuffer, secretKey);
  }

  if (typeof Worker === 'undefined') {
    return encryptFile(file, secretKey);
  }

  try {
    const fileBuffer = await file.arrayBuffer();
    const worker = new Worker(new URL('../workers/encrypt-file.worker.ts', import.meta.url), {
      type: 'module',
    });

    try {
      const encrypted = await new Promise<Uint8Array>((resolve, reject) => {
        worker.onmessage = (event: MessageEvent) => {
          const data = event.data as
            { ok: true; encryptedBuffer: ArrayBuffer } | { ok: false; error?: string };
          if (data?.ok) {
            resolve(new Uint8Array(data.encryptedBuffer));
          } else {
            reject(new Error(data?.error || 'Worker encryption failed'));
          }
        };
        worker.onerror = (event) => {
          reject(new Error(event.message || 'Worker encryption failed'));
        };
        worker.postMessage({ fileBuffer, secretKey }, [fileBuffer]);
      });
      return encrypted;
    } finally {
      worker.terminate();
    }
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn(
        '[encryptFileInWorker] Worker failed, falling back to main-thread encryption:',
        err,
      );
    }
    return options?.fastHardware
      ? encryptFileEnvelopeFast(await file.arrayBuffer(), secretKey)
      : encryptFile(file, secretKey);
  }
};

export const decryptFileInWorker = async (
  encryptedBundle: Uint8Array | ArrayBuffer,
  secretKey: string | CryptoKey,
): Promise<ArrayBuffer> => {
  const bytes =
    encryptedBundle instanceof Uint8Array ? encryptedBundle : new Uint8Array(encryptedBundle);

  if (typeof Worker === 'undefined' || bytes.byteLength < 64 * 1024) {
    return decryptFileEnvelope(bytes, secretKey);
  }

  try {
    const worker = new Worker(new URL('../workers/decrypt-file.worker.ts', import.meta.url), {
      type: 'module',
    });

    try {
      const transferBuffer = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer;

      const decrypted = await new Promise<ArrayBuffer>((resolve, reject) => {
        worker.onmessage = (event: MessageEvent) => {
          const data = event.data as
            { ok: true; decryptedBuffer: ArrayBuffer } | { ok: false; error?: string };
          if (data?.ok) {
            resolve(data.decryptedBuffer);
          } else {
            reject(new Error(data?.error || 'Worker decryption failed'));
          }
        };
        worker.onerror = (event) => {
          reject(new Error(event.message || 'Worker decryption error'));
        };
        worker.postMessage({ encryptedBuffer: transferBuffer, secretKey }, [transferBuffer]);
      });
      return decrypted;
    } finally {
      worker.terminate();
    }
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn(
        '[decryptFileInWorker] Worker failed, falling back to main-thread decryption:',
        err,
      );
    }
    return decryptFileEnvelope(bytes, secretKey);
  }
};

/**
 * Splits a base64 key into two XOR shares (Share A and Share B)
 */
export const splitKey = (keyBase64: string): { shareA: string; shareB: string } => {
  const keyBytes = base64ToUint8Array(keyBase64);
  const shareBBytes = new Uint8Array(keyBytes.length);
  crypto.getRandomValues(shareBBytes);

  const shareABytes = new Uint8Array(keyBytes.length);
  for (let i = 0; i < keyBytes.length; i++) {
    shareABytes[i] = keyBytes[i] ^ shareBBytes[i];
  }

  const shareA = uint8ArrayToBase64(shareABytes);
  const shareB = uint8ArrayToBase64(shareBBytes);

  // Securely wipe memory buffers
  keyBytes.fill(0);
  shareABytes.fill(0);
  shareBBytes.fill(0);

  return {
    shareA,
    shareB,
  };
};

/**
 * Reconstructs the original key from two XOR shares (Share A and Share B)
 */
export const reconstructKey = (shareABase64: string, shareBBase64: string): string => {
  const aBytes = base64ToUint8Array(shareABase64);
  const bBytes = base64ToUint8Array(shareBBase64);
  const resultBytes = new Uint8Array(aBytes.length);

  for (let i = 0; i < aBytes.length; i++) {
    resultBytes[i] = aBytes[i] ^ bBytes[i];
  }

  const result = uint8ArrayToBase64(resultBytes);

  // Securely wipe memory buffers
  aBytes.fill(0);
  bBytes.fill(0);
  resultBytes.fill(0);

  return result;
};

/**
 * Duress / Decoy Vault PIN Key Derivation (PBKDF2 with 100,000 rounds)
 */
export const hashDecoyPin = async (
  pin: string,
  customSalt?: string,
): Promise<{ hash: string; salt: string }> => {
  if (!pin || typeof pin !== 'string') {
    throw new Error('PIN is required to generate duress hash');
  }
  const trimmed = pin.trim();
  if (!/^\d{4,12}$/.test(trimmed)) {
    throw new Error(
      'Decoy PIN must contain only numbers (digits 0-9) and be between 4 and 12 digits long',
    );
  }
  const enc = new TextEncoder();
  const salt =
    customSalt ||
    Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(trimmed),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: enc.encode(`vault-decoy:${salt}`),
      iterations: 100_000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256,
  );
  const hash = Array.from(new Uint8Array(derivedBits))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return { hash: `pbkdf2:100000:${salt}:${hash}`, salt };
};

/**
 * Constant-time string comparison to prevent timing attacks.
 */
export const timingSafeEqualStrings = (a: string, b: string): boolean => {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }
  const lenA = a.length;
  const lenB = b.length;
  let mismatch = lenA ^ lenB;
  const maxLen = Math.max(lenA, lenB);
  for (let i = 0; i < maxLen; i++) {
    const charA = i < lenA ? a.charCodeAt(i) : 0;
    const charB = i < lenB ? b.charCodeAt(i) : 0;
    mismatch |= charA ^ charB;
  }
  return mismatch === 0;
};

/**
 * Verifies a candidate duress PIN against stored hash payload (PBKDF2, legacy SHA-256, or plaintext fallback).
 */
export const verifyDecoyPin = async (
  inputPin: string,
  storedHashOrPayload: string,
): Promise<boolean> => {
  if (!storedHashOrPayload || !inputPin || typeof inputPin !== 'string') {
    return false;
  }

  const trimmedPin = inputPin.trim().normalize('NFKC');
  const cleanPayload = storedHashOrPayload.trim().replace(/^["']|["']$/g, '');

  if (
    !cleanPayload ||
    !trimmedPin ||
    cleanPayload === 'true' ||
    cleanPayload === 'false' ||
    cleanPayload === 'null' ||
    cleanPayload === 'undefined'
  ) {
    return false;
  }

  // 1. Direct plaintext match (only if clean payload is at least 4 chars and matches in constant time)
  if (
    cleanPayload.length >= 4 &&
    (timingSafeEqualStrings(cleanPayload, inputPin.normalize('NFKC')) ||
      timingSafeEqualStrings(cleanPayload, trimmedPin))
  ) {
    return true;
  }

  // 2. PBKDF2 format: "pbkdf2:iterations:salt:hash"
  if (cleanPayload.startsWith('pbkdf2:')) {
    const parts = cleanPayload.split(':');
    if (parts.length === 4) {
      const [, iterStr, salt, expectedHash] = parts;
      const iterations = parseInt(iterStr, 10) || 100_000;
      const enc = new TextEncoder();

      for (const candidatePin of [trimmedPin, inputPin.normalize('NFKC')]) {
        try {
          const keyMaterial = await crypto.subtle.importKey(
            'raw',
            enc.encode(candidatePin),
            { name: 'PBKDF2' },
            false,
            ['deriveBits'],
          );

          // Variant A: salt with vault-decoy prefix
          const derivedBits1 = await crypto.subtle.deriveBits(
            {
              name: 'PBKDF2',
              salt: enc.encode(`vault-decoy:${salt}`),
              iterations,
              hash: 'SHA-256',
            },
            keyMaterial,
            256,
          );
          const derivedHash1 = Array.from(new Uint8Array(derivedBits1))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');
          if (timingSafeEqualStrings(derivedHash1.toLowerCase(), expectedHash.toLowerCase())) {
            return true;
          }

          // Variant B: salt without prefix
          const derivedBits2 = await crypto.subtle.deriveBits(
            {
              name: 'PBKDF2',
              salt: enc.encode(salt),
              iterations,
              hash: 'SHA-256',
            },
            keyMaterial,
            256,
          );
          const derivedHash2 = Array.from(new Uint8Array(derivedBits2))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');
          if (timingSafeEqualStrings(derivedHash2.toLowerCase(), expectedHash.toLowerCase())) {
            return true;
          }
        } catch (err) {
          console.error('[Decoy] PBKDF2 verification error:', err);
        }
      }
    }
  }

  // 2. SHA-256 format
  try {
    const enc = new TextEncoder();
    for (const candidatePin of [trimmedPin, inputPin.normalize('NFKC')]) {
      const hashBuf1 = await crypto.subtle.digest(
        'SHA-256',
        enc.encode(`vault-decoy-salt:${candidatePin}`),
      );
      const legacyHash1 = Array.from(new Uint8Array(hashBuf1))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      if (timingSafeEqualStrings(legacyHash1.toLowerCase(), cleanPayload.toLowerCase())) {
        return true;
      }

      const hashBuf2 = await crypto.subtle.digest('SHA-256', enc.encode(candidatePin));
      const legacyHash2 = Array.from(new Uint8Array(hashBuf2))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      if (timingSafeEqualStrings(legacyHash2.toLowerCase(), cleanPayload.toLowerCase())) {
        return true;
      }
    }
  } catch (err) {
    console.error('[Decoy] SHA-256 verification error:', err);
  }

  return false;
};

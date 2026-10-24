const AES_GCM_IV_LENGTH = 12;
const CHACHA20_NONCE_LENGTH = 12;
const KEY_BYTE_LENGTH = 32;
const CASCADE_ENC_DEK_LENGTH = 80;
const MAX_SECRET_KEY_BASE64_LENGTH = 1024;
const CHACHA_AAD = new TextEncoder().encode('vault:e2ee:chacha20-poly1305:v1');
const CASCADE_DEK_AAD = new TextEncoder().encode('vault:dek:cascade-gcm:v1');
const DEK_AAD = new TextEncoder().encode('vault:dek:aes-gcm:v2');
const ENVELOPE_MAGIC_CASCADE = new Uint8Array([0x56, 0x43, 0x41, 0x53, 0x30, 0x31]); // "VCAS01"
const ENVELOPE_MAGIC_V2 = new Uint8Array([0x56, 0x45, 0x4e, 0x56, 0x30, 0x32]); // "VENV02"

export type DecryptFileWorkerRequest = {
  encryptedBuffer: ArrayBuffer;
  secretKey: string | CryptoKey;
  requestId?: string;
};

export type DecryptFileWorkerResponseSuccess = {
  ok: true;
  decryptedBuffer: ArrayBuffer;
  requestId?: string;
};

export type DecryptFileWorkerErrorCode =
  'INVALID_PAYLOAD' | 'INVALID_SECRET_KEY' | 'UNSUPPORTED_CRYPTO' | 'DECRYPTION_FAILED';

export type DecryptFileWorkerResponseFailure = {
  ok: false;
  error: string;
  code: DecryptFileWorkerErrorCode;
  requestId?: string;
};

export type DecryptFileWorkerResponse =
  DecryptFileWorkerResponseSuccess | DecryptFileWorkerResponseFailure;

class WorkerProtocolError extends Error {
  readonly code: DecryptFileWorkerErrorCode;

  constructor(code: DecryptFileWorkerErrorCode, message: string) {
    super(message);
    this.name = 'WorkerProtocolError';
    this.code = code;
  }
}

type WorkerMessageScope = {
  onmessage: ((event: MessageEvent<unknown>) => void | Promise<void>) | null;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
  addEventListener: (type: string, listener: (event: any) => void) => void;
};

const workerScope = self as unknown as WorkerMessageScope;

// Preload & cache libsodium-wrappers instance
let sodiumPromise: Promise<any> | null = null;
const getSodium = async (): Promise<any> => {
  if (!sodiumPromise) {
    sodiumPromise = import('libsodium-wrappers')
      .then(async (m) => {
        const s = m.default || m;
        await s.ready;
        return s;
      })
      .catch((err) => {
        sodiumPromise = null;
        throw err;
      });
  }
  return sodiumPromise;
};

void getSodium().catch(() => {});

const isCryptoKey = (key: unknown): key is CryptoKey => {
  if (typeof CryptoKey !== 'undefined' && key instanceof CryptoKey) {
    return true;
  }
  return (
    typeof key === 'object' &&
    key !== null &&
    'type' in key &&
    'algorithm' in key &&
    'usages' in key
  );
};

const base64ToUint8Array = (base64: string): Uint8Array => {
  let normalized = base64.trim();
  if (!normalized || normalized.length > MAX_SECRET_KEY_BASE64_LENGTH) {
    throw new WorkerProtocolError('INVALID_SECRET_KEY', 'Secret key format is invalid.');
  }

  normalized = normalized.replace(/-/g, '+').replace(/_/g, '/');
  while (normalized.length % 4 !== 0) {
    normalized += '=';
  }

  let binaryString: string;
  try {
    binaryString = atob(normalized);
  } catch {
    throw new WorkerProtocolError('INVALID_SECRET_KEY', 'Secret key is not decodable base64.');
  }

  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

const toArrayBuffer = (value: Uint8Array): ArrayBuffer =>
  value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;

const isCascadeBundle = (bytes: Uint8Array): boolean => {
  if (bytes.length < ENVELOPE_MAGIC_CASCADE.length + 1) return false;
  for (let i = 0; i < ENVELOPE_MAGIC_CASCADE.length; i++) {
    if (bytes[i] !== ENVELOPE_MAGIC_CASCADE[i]) return false;
  }
  return true;
};

const isEnvelopeV2Bundle = (bytes: Uint8Array): boolean => {
  if (bytes.length < ENVELOPE_MAGIC_V2.length + 1) return false;
  for (let i = 0; i < ENVELOPE_MAGIC_V2.length; i++) {
    if (bytes[i] !== ENVELOPE_MAGIC_V2[i]) return false;
  }
  return true;
};

const decryptAesGcmWithFallback = async (
  subtle: SubtleCrypto,
  cryptoKey: CryptoKey,
  iv: Uint8Array,
  ciphertext: Uint8Array,
): Promise<ArrayBuffer> => {
  const ivBuf = toArrayBuffer(iv);
  const cipherBuf = toArrayBuffer(ciphertext);
  const aad = new TextEncoder().encode('vault:e2ee:aes-gcm:v2');

  try {
    return await subtle.decrypt(
      { name: 'AES-GCM', iv: ivBuf, additionalData: toArrayBuffer(aad) },
      cryptoKey,
      cipherBuf,
    );
  } catch {
    return await subtle.decrypt({ name: 'AES-GCM', iv: ivBuf }, cryptoKey, cipherBuf);
  }
};

workerScope.onmessage = async (event: MessageEvent<unknown>) => {
  let requestId: string | undefined;

  try {
    const data = event.data as DecryptFileWorkerRequest;
    if (!data || !(data.encryptedBuffer instanceof ArrayBuffer)) {
      throw new WorkerProtocolError('INVALID_PAYLOAD', 'encryptedBuffer must be an ArrayBuffer');
    }
    requestId = data.requestId;

    const subtle = self.crypto?.subtle || globalThis.crypto?.subtle;
    if (!subtle?.decrypt || !subtle?.importKey) {
      throw new WorkerProtocolError(
        'UNSUPPORTED_CRYPTO',
        'WebCrypto APIs are unavailable in worker.',
      );
    }

    const { encryptedBuffer, secretKey } = data;
    const bundle = new Uint8Array(encryptedBuffer);

    // Prepare Master Key (KEK)
    let kekCryptoKey: CryptoKey;
    if (isCryptoKey(secretKey)) {
      kekCryptoKey = secretKey;
    } else {
      const keyBuf = base64ToUint8Array(secretKey);
      if (keyBuf.length !== KEY_BYTE_LENGTH) {
        throw new WorkerProtocolError('INVALID_SECRET_KEY', 'Invalid key length.');
      }
      kekCryptoKey = await subtle.importKey(
        'raw',
        keyBuf as unknown as BufferSource,
        { name: 'AES-GCM' },
        false,
        ['decrypt'],
      );
      keyBuf.fill(0);
    }

    let decryptedBuffer: ArrayBuffer;

    // 1. Dual-Engine Cascade Envelope (VCAS01)
    if (isCascadeBundle(bundle)) {
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
        decryptedDekBuf = await subtle.decrypt(
          {
            name: 'AES-GCM',
            iv: toArrayBuffer(kekIv),
            additionalData: toArrayBuffer(CASCADE_DEK_AAD),
          },
          kekCryptoKey,
          toArrayBuffer(encDekBytes),
        );
      } catch {
        decryptedDekBuf = await subtle.decrypt(
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

      try {
        // Layer 1 (Outer): ChaCha20-Poly1305
        const sodium = await getSodium();
        const innerAesCiphertext = sodium.crypto_aead_chacha20poly1305_ietf_decrypt(
          null,
          cascadeCiphertext,
          CHACHA_AAD,
          fileChaChaNonce,
          dekChaChaBytes,
        );

        // Layer 2 (Inner): AES-256-GCM
        const dekAesCryptoKey = await subtle.importKey(
          'raw',
          toArrayBuffer(dekAesBytes),
          { name: 'AES-GCM' },
          false,
          ['decrypt'],
        );

        decryptedBuffer = await decryptAesGcmWithFallback(
          subtle,
          dekAesCryptoKey,
          fileAesIv,
          innerAesCiphertext,
        );
      } finally {
        dekBytes.fill(0);
      }
    } else if (isEnvelopeV2Bundle(bundle)) {
      // 2. Backward Compatibility: Single-layer AES-256-GCM Envelope (VENV02)
      let offset = ENVELOPE_MAGIC_V2.length;
      const kekIv = bundle.subarray(offset, offset + AES_GCM_IV_LENGTH);
      offset += AES_GCM_IV_LENGTH;

      const encDekBytes = bundle.subarray(offset, offset + 48);
      offset += 48;

      const fileIv = bundle.subarray(offset, offset + AES_GCM_IV_LENGTH);
      offset += AES_GCM_IV_LENGTH;

      const encFileBytes = bundle.subarray(offset);

      const decryptedDekBuf = await subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: toArrayBuffer(kekIv),
          additionalData: toArrayBuffer(DEK_AAD),
        },
        kekCryptoKey,
        toArrayBuffer(encDekBytes),
      );

      const dekCryptoKey = await subtle.importKey(
        'raw',
        decryptedDekBuf,
        { name: 'AES-GCM' },
        false,
        ['decrypt'],
      );
      new Uint8Array(decryptedDekBuf).fill(0);

      decryptedBuffer = await decryptAesGcmWithFallback(subtle, dekCryptoKey, fileIv, encFileBytes);
    } else {
      // 3. Fallback direct AES-GCM bundle
      const iv = bundle.subarray(0, AES_GCM_IV_LENGTH);
      const ciphertext = bundle.subarray(AES_GCM_IV_LENGTH);
      decryptedBuffer = await decryptAesGcmWithFallback(subtle, kekCryptoKey, iv, ciphertext);
    }

    workerScope.postMessage(
      {
        ok: true,
        decryptedBuffer,
        requestId,
      },
      [decryptedBuffer],
    );
  } catch (error: any) {
    workerScope.postMessage({
      ok: false,
      error: error?.message || 'Worker decryption failed',
      code: error?.code || 'DECRYPTION_FAILED',
      requestId,
    });
  }
};

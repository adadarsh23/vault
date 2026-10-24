const AES_GCM_IV_LENGTH = 12;
const CHACHA20_NONCE_LENGTH = 12;
const KEY_BYTE_LENGTH = 32;
const CASCADE_DEK_BYTES = 64;
const MAX_SECRET_KEY_BASE64_LENGTH = 1024;
const AES_GCM_AAD = new TextEncoder().encode('vault:e2ee:aes-gcm:v2');
const CHACHA_AAD = new TextEncoder().encode('vault:e2ee:chacha20-poly1305:v1');
const CASCADE_DEK_AAD = new TextEncoder().encode('vault:dek:cascade-gcm:v1');
const ENVELOPE_MAGIC_CASCADE = new Uint8Array([0x56, 0x43, 0x41, 0x53, 0x30, 0x31]); // "VCAS01"

export type EncryptFileWorkerRequest = {
  fileBuffer: ArrayBuffer;
  secretKey: string | CryptoKey;
  requestId?: string;
};

export type EncryptFileWorkerResponseSuccess = {
  ok: true;
  encryptedBuffer: ArrayBuffer;
  requestId?: string;
};

export type EncryptFileWorkerErrorCode =
  'INVALID_PAYLOAD' | 'INVALID_SECRET_KEY' | 'UNSUPPORTED_CRYPTO' | 'ENCRYPTION_FAILED';

export type EncryptFileWorkerResponseFailure = {
  ok: false;
  error: string;
  code: EncryptFileWorkerErrorCode;
  requestId?: string;
};

export type EncryptFileWorkerResponse =
  EncryptFileWorkerResponseSuccess | EncryptFileWorkerResponseFailure;

class WorkerProtocolError extends Error {
  readonly code: EncryptFileWorkerErrorCode;

  constructor(code: EncryptFileWorkerErrorCode, message: string) {
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

// Preload & cache libsodium-wrappers instance with auto-recovery on failure
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

// Eagerly prewarm libsodium to avoid cold-start latency during file encryption
void getSodium().catch(() => {});

// Cross-realm robust CryptoKey detection
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

  // Handle URL-safe Base64 and missing padding
  normalized = normalized.replace(/-/g, '+').replace(/_/g, '/');
  while (normalized.length % 4 !== 0) {
    normalized += '=';
  }

  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
    throw new WorkerProtocolError('INVALID_SECRET_KEY', 'Secret key must be valid base64.');
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

const parseRequest = (data: unknown): EncryptFileWorkerRequest => {
  if (!data || typeof data !== 'object') {
    throw new WorkerProtocolError('INVALID_PAYLOAD', 'Worker payload must be an object.');
  }

  const candidate = data as Partial<EncryptFileWorkerRequest>;
  if (!(candidate.fileBuffer instanceof ArrayBuffer)) {
    throw new WorkerProtocolError('INVALID_PAYLOAD', 'fileBuffer must be an ArrayBuffer.');
  }
  if (typeof candidate.secretKey !== 'string' && !isCryptoKey(candidate.secretKey)) {
    throw new WorkerProtocolError('INVALID_PAYLOAD', 'secretKey must be a string or a CryptoKey.');
  }
  if (candidate.requestId !== undefined && typeof candidate.requestId !== 'string') {
    throw new WorkerProtocolError('INVALID_PAYLOAD', 'requestId must be a string when provided.');
  }

  return {
    fileBuffer: candidate.fileBuffer,
    secretKey: candidate.secretKey,
    requestId: candidate.requestId,
  };
};

const postFailure = (
  requestId: string | undefined,
  code: EncryptFileWorkerErrorCode,
  error: string,
) => {
  const payload: EncryptFileWorkerResponseFailure = {
    ok: false,
    error,
    code,
    requestId,
  };
  workerScope.postMessage(payload);
};

const toFailure = (error: unknown): { code: EncryptFileWorkerErrorCode; message: string } => {
  if (error instanceof WorkerProtocolError) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof Error) {
    return { code: 'ENCRYPTION_FAILED', message: error.message };
  }
  return { code: 'ENCRYPTION_FAILED', message: 'File encryption failed.' };
};

workerScope.onmessage = async (event: MessageEvent<unknown>) => {
  let requestId: string | undefined;

  // Sensitive buffers tracked for guaranteed wiping in finally block
  let keyBuf: Uint8Array | null = null;
  let keyMaterial: Uint8Array | null = null;
  let dekBytes: Uint8Array | null = null;
  let dekAesBytes: Uint8Array | null = null;
  let dekChaChaBytes: Uint8Array | null = null;
  let aesCipherBytes: Uint8Array | null = null;

  try {
    const request = parseRequest(event.data);
    requestId = request.requestId;

    const subtle = self.crypto?.subtle || globalThis.crypto?.subtle;
    if (!subtle?.encrypt || !subtle?.importKey) {
      throw new WorkerProtocolError(
        'UNSUPPORTED_CRYPTO',
        'WebCrypto AES-GCM APIs are unavailable in this environment.',
      );
    }

    const { fileBuffer, secretKey } = request;

    // 1. Prepare Master Key (KEK)
    let kekCryptoKey: CryptoKey;
    if (isCryptoKey(secretKey)) {
      kekCryptoKey = secretKey;
    } else {
      keyBuf = base64ToUint8Array(secretKey);
      if (keyBuf.length !== KEY_BYTE_LENGTH) {
        throw new WorkerProtocolError(
          'INVALID_SECRET_KEY',
          `Invalid key length: expected ${KEY_BYTE_LENGTH} bytes.`,
        );
      }

      keyMaterial = new Uint8Array(keyBuf);
      kekCryptoKey = await subtle.importKey(
        'raw',
        keyMaterial as unknown as BufferSource,
        { name: 'AES-GCM' },
        false,
        ['encrypt'],
      );

      // Clean up key material immediately after import
      keyBuf.fill(0);
      keyBuf = null;
      keyMaterial.fill(0);
      keyMaterial = null;
    }

    // 2. Generate random 64-byte Dual DEKs (32B AES-GCM + 32B ChaCha20-Poly1305)
    dekBytes = crypto.getRandomValues(new Uint8Array(CASCADE_DEK_BYTES));
    dekAesBytes = new Uint8Array(32);
    dekAesBytes.set(dekBytes.subarray(0, 32));
    dekChaChaBytes = new Uint8Array(32);
    dekChaChaBytes.set(dekBytes.subarray(32, 64));

    const dekAesCryptoKey = await subtle.importKey(
      'raw',
      dekAesBytes as unknown as BufferSource,
      { name: 'AES-GCM' },
      false,
      ['encrypt'],
    );

    // 3. Layer 1 (Inner): Encrypt File Buffer with AES-256-GCM
    const fileAesIv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_LENGTH));
    const fileAesCiphertext = await subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: new Uint8Array(fileAesIv),
        additionalData: new Uint8Array(AES_GCM_AAD),
      },
      dekAesCryptoKey,
      fileBuffer,
    );
    aesCipherBytes = new Uint8Array(fileAesCiphertext);

    // 4. Layer 2 (Outer): Encrypt AES Ciphertext with ChaCha20-Poly1305
    const sodium = await getSodium();
    const fileChaChaNonce = crypto.getRandomValues(new Uint8Array(CHACHA20_NONCE_LENGTH));
    const cascadeCiphertext = sodium.crypto_aead_chacha20poly1305_ietf_encrypt(
      aesCipherBytes,
      CHACHA_AAD,
      null,
      fileChaChaNonce,
      dekChaChaBytes,
    );

    // Shred intermediate AES ciphertext immediately
    aesCipherBytes.fill(0);
    aesCipherBytes = null;

    // 5. Encrypt Dual DEKs with KEK
    const kekIv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_LENGTH));
    const encryptedDek = await subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: new Uint8Array(kekIv),
        additionalData: new Uint8Array(CASCADE_DEK_AAD),
      },
      kekCryptoKey,
      dekBytes as unknown as BufferSource,
    );

    // Securely wipe plain DEK buffers immediately after encryption
    dekBytes.fill(0);
    dekBytes = null;
    dekAesBytes.fill(0);
    dekAesBytes = null;
    dekChaChaBytes.fill(0);
    dekChaChaBytes = null;

    const encDekBytes = new Uint8Array(encryptedDek);
    const encFileBytes =
      cascadeCiphertext instanceof Uint8Array
        ? cascadeCiphertext
        : new Uint8Array(cascadeCiphertext);

    // Bundle: [6B VCAS01] + [12B KEK IV] + [80B Encrypted DEK] + [12B File AES IV] + [12B File ChaCha Nonce] + [Cascade Ciphertext]
    const bundleLength =
      ENVELOPE_MAGIC_CASCADE.length +
      kekIv.length +
      encDekBytes.length +
      fileAesIv.length +
      fileChaChaNonce.length +
      encFileBytes.length;

    const bundle = new Uint8Array(bundleLength);
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
    bundle.set(encFileBytes, offset);

    const payload: EncryptFileWorkerResponseSuccess = {
      ok: true,
      encryptedBuffer: bundle.buffer,
      requestId,
    };
    workerScope.postMessage(payload as EncryptFileWorkerResponse, [bundle.buffer]);
  } catch (error) {
    const failure = toFailure(error);
    postFailure(requestId, failure.code, failure.message);
  } finally {
    // Cryptographic memory hygiene: strictly wipe sensitive buffers on all paths
    if (keyBuf) {
      keyBuf.fill(0);
      keyBuf = null;
    }
    if (keyMaterial) {
      keyMaterial.fill(0);
      keyMaterial = null;
    }
    if (dekBytes) {
      dekBytes.fill(0);
      dekBytes = null;
    }
    if (dekAesBytes) {
      dekAesBytes.fill(0);
      dekAesBytes = null;
    }
    if (dekChaChaBytes) {
      dekChaChaBytes.fill(0);
      dekChaChaBytes = null;
    }
    if (aesCipherBytes) {
      aesCipherBytes.fill(0);
      aesCipherBytes = null;
    }
  }
};

if (typeof self !== 'undefined' && typeof (self as any).addEventListener === 'function') {
  (self as any).addEventListener('error', (event: any) => {
    postFailure(undefined, 'ENCRYPTION_FAILED', event?.message || 'Worker runtime error');
  });

  (self as any).addEventListener('unhandledrejection', (event: any) => {
    postFailure(
      undefined,
      'ENCRYPTION_FAILED',
      event?.reason?.message || 'Unhandled promise rejection in worker',
    );
  });
}

import {
  base64ToUint8Array,
  uint8ArrayToBase64,
  isEnvelopeBundle,
  rotateItemEnvelopeKey,
} from './cryptoPrimitives';

interface ReencryptableVaultItem {
  title: string;
  content: string | Uint8Array;
}

const toArrayBuffer = (value: Uint8Array): ArrayBuffer => new Uint8Array(value).buffer;
const AES_GCM_IV_LENGTH = 12;
const AES_GCM_TAG_LENGTH = 16;
const AES_KEY_LENGTH_BYTES = 32;
const ENCRYPTED_BUNDLE_MIN_BYTES = AES_GCM_IV_LENGTH + AES_GCM_TAG_LENGTH;
const AES_GCM_AAD = new TextEncoder().encode('vault:e2ee:aes-gcm:v2');

type VaultKeyRotationErrorCode =
  'CRYPTO_UNAVAILABLE' | 'INVALID_KEY_MATERIAL' | 'INVALID_CONTENT' | 'INTEGRITY_CHECK_FAILED';

type VaultKeyRotationError = Error & {
  code?: VaultKeyRotationErrorCode;
  cause?: unknown;
};

const createRotationError = (
  message: string,
  code: VaultKeyRotationErrorCode,
  cause?: unknown,
): VaultKeyRotationError => {
  const error = new Error(message) as VaultKeyRotationError;
  error.code = code;
  if (cause !== undefined) {
    error.cause = cause;
  }
  return error;
};

const getItemTitleForMessage = (title?: string): string => {
  const trimmed = typeof title === 'string' ? title.trim() : '';
  return trimmed ? trimmed : 'Untitled item';
};

const decodeBase64Safely = (value: string): Uint8Array | null => {
  try {
    return base64ToUint8Array(value);
  } catch {
    return null;
  }
};

const importAesKey = async (rawKey: string | CryptoKey, usages: KeyUsage[]): Promise<CryptoKey> => {
  if (rawKey instanceof CryptoKey) {
    return rawKey;
  }

  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw createRotationError(
      'Secure cryptography is unavailable in this environment.',
      'CRYPTO_UNAVAILABLE',
    );
  }

  const keyBytes = decodeBase64Safely(rawKey);
  if (!keyBytes || keyBytes.byteLength !== AES_KEY_LENGTH_BYTES) {
    throw createRotationError(
      'Invalid vault key material for key rotation.',
      'INVALID_KEY_MATERIAL',
    );
  }

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(keyBytes),
    { name: 'AES-GCM' },
    false,
    usages,
  );

  // Zero out raw key bytes after import
  keyBytes.fill(0);

  return cryptoKey;
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

const looksLikeServerRef = (value: string): boolean =>
  /^(https?:\/\/|blob:|data:|cloud:\/\/|gridfs:\/\/|\/?uploads\/|\/?api\/)/i.test(value);

const looksLikeEncryptedBundle = (bytes: Uint8Array): boolean =>
  bytes.length >= ENCRYPTED_BUNDLE_MIN_BYTES;

const looksLikeUtf8Text = (bytes: Uint8Array): boolean => {
  if (!bytes || bytes.length === 0) return true;
  try {
    const sample = bytes.slice(0, Math.min(bytes.length, 1024));
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(sample);
    for (let i = 0; i < decoded.length; i++) {
      const code = decoded.charCodeAt(i);
      // Allow standard whitespace (tab 9, LF 10, CR 13) and printable characters (>= 32)
      if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
};

const looksLikeReadableMediaBytes = (bytes: Uint8Array): boolean => {
  if (!bytes || bytes.length < 4) return false;

  // PDF: %PDF- (0x25 0x50 0x44 0x46)
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46
  ) {
    return true;
  }

  // PNG: 89 50 4E 47
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return true;
  }

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return true;

  // GIF: GIF8
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38
  ) {
    return true;
  }

  // WebP: RIFF....WEBP
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return true;
  }

  // BMP: BM
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return true;
  }

  // ZIP / OpenXML Office (DOCX, XLSX, PPTX) / EPUB / APK: PK\x03\x04
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    (bytes[2] === 0x03 || bytes[2] === 0x05) &&
    (bytes[3] === 0x04 || bytes[3] === 0x06)
  ) {
    return true;
  }

  // 7-Zip: 7z\xBC\xAF\x27\x1C
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x37 &&
    bytes[1] === 0x7a &&
    bytes[2] === 0xbc &&
    bytes[3] === 0xaf &&
    bytes[4] === 0x27 &&
    bytes[5] === 0x1c
  ) {
    return true;
  }

  // RAR: Rar!\x1A\x07
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x61 &&
    bytes[2] === 0x72 &&
    bytes[3] === 0x21 &&
    bytes[4] === 0x1a &&
    bytes[5] === 0x07
  ) {
    return true;
  }

  // GZIP: 0x1F 0x8B
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    return true;
  }

  // MP4 / MOV / M4A: ftyp
  if (
    bytes.length >= 8 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    return true;
  }

  // MP3: ID3 or MPEG sync (0xFF 0xFB/0xF3/0xF2)
  if (
    (bytes.length >= 3 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) ||
    (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
  ) {
    return true;
  }

  // WAV / AVI: RIFF
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46
  ) {
    return true;
  }

  // WebM / Matroska (MKV): 0x1A 0x45 0xDF 0xA3
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  ) {
    return true;
  }

  // Plain Text / JSON / CSV / XML / HTML (Decoy or unencrypted uploads)
  if (looksLikeUtf8Text(bytes)) {
    return true;
  }

  return false;
};

export const reencryptVaultItemContent = async (
  item: ReencryptableVaultItem,
  oldKey: string | CryptoKey,
  newKey: string | CryptoKey,
): Promise<ReencryptableVaultItem['content']> => {
  if (!oldKey || !newKey) {
    throw createRotationError(
      'Old and new vault keys are required for key rotation.',
      'INVALID_KEY_MATERIAL',
    );
  }
  if (oldKey === newKey) {
    return item.content;
  }

  const itemTitle = getItemTitleForMessage(item.title);

  // Validate and import crypto keys upfront with full usages for robust key-material verification
  const oldCryptoKey = await importAesKey(oldKey, ['encrypt', 'decrypt']);
  const newCryptoKey = await importAesKey(newKey, ['encrypt', 'decrypt']);

  if (item.content == null) {
    return '';
  }

  if (item.content instanceof Uint8Array) {
    // 1. Modern Dual-Engine Cascade Envelope (VCAS01) or V2 Envelope (VENV02)
    if (isEnvelopeBundle(item.content)) {
      try {
        return await rotateItemEnvelopeKey(item.content, oldCryptoKey, newCryptoKey);
      } catch (cause) {
        throw createRotationError(
          `Integrity check failed for "${itemTitle}"`,
          'INTEGRITY_CHECK_FAILED',
          cause,
        );
      }
    }

    // 2. Legacy direct AES-GCM bundle or raw media/document bytes
    let decrypted: ArrayBuffer;
    if (looksLikeEncryptedBundle(item.content)) {
      const iv = item.content.slice(0, AES_GCM_IV_LENGTH);
      const data = item.content.slice(AES_GCM_IV_LENGTH);
      try {
        decrypted = await decryptAesGcmWithFallback(oldCryptoKey, iv, data);
      } catch (cause) {
        // Some legacy/broken records contain raw media bytes instead of encrypted payloads.
        if (!looksLikeReadableMediaBytes(item.content)) {
          throw createRotationError(
            `Integrity check failed for "${itemTitle}"`,
            'INTEGRITY_CHECK_FAILED',
            cause,
          );
        }
        decrypted = toArrayBuffer(item.content);
      }
    } else {
      // Short payload cannot be AES-GCM ciphertext; treat as already-plain bytes.
      decrypted = toArrayBuffer(item.content);
    }

    const newIv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_LENGTH));
    const newEncrypted = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: toArrayBuffer(newIv),
        additionalData: toArrayBuffer(AES_GCM_AAD),
      },
      newCryptoKey,
      decrypted,
    );

    const result = new Uint8Array(newIv.length + newEncrypted.byteLength);
    result.set(newIv);
    result.set(new Uint8Array(newEncrypted), newIv.length);
    return result;
  }

  if (typeof item.content === 'string') {
    if (looksLikeServerRef(item.content)) {
      // Server/file/cloud references are not encrypted payload bytes.
      return item.content;
    }

    const encryptedBytes = decodeBase64Safely(item.content);
    if (!encryptedBytes) {
      // Non-base64 textual content should be preserved.
      return item.content;
    }

    // Modern Envelope bundle encoded as base64 string
    if (isEnvelopeBundle(encryptedBytes)) {
      try {
        const rotated = await rotateItemEnvelopeKey(encryptedBytes, oldCryptoKey, newCryptoKey);
        return uint8ArrayToBase64(rotated);
      } catch (cause) {
        throw createRotationError(
          `Integrity check failed for "${itemTitle}"`,
          'INTEGRITY_CHECK_FAILED',
          cause,
        );
      }
    }

    if (!looksLikeEncryptedBundle(encryptedBytes)) {
      // Non-encrypted textual content should be preserved.
      return item.content;
    }

    const iv = encryptedBytes.slice(0, AES_GCM_IV_LENGTH);
    const data = encryptedBytes.slice(AES_GCM_IV_LENGTH);

    let decrypted: ArrayBuffer;
    try {
      decrypted = await decryptAesGcmWithFallback(oldCryptoKey, iv, data);
    } catch (cause) {
      throw createRotationError(
        `Integrity check failed for "${itemTitle}"`,
        'INTEGRITY_CHECK_FAILED',
        cause,
      );
    }

    const newIv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_LENGTH));
    const newEncrypted = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: toArrayBuffer(newIv),
        additionalData: toArrayBuffer(AES_GCM_AAD),
      },
      newCryptoKey,
      decrypted,
    );

    const result = new Uint8Array(newIv.length + newEncrypted.byteLength);
    result.set(newIv);
    result.set(new Uint8Array(newEncrypted), newIv.length);
    return uint8ArrayToBase64(result);
  }

  throw createRotationError(`Invalid content format for "${itemTitle}"`, 'INVALID_CONTENT');
};

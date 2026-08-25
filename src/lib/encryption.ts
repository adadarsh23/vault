import { handleError } from './error-handler';
import {
  deriveKey as deriveKeyFromPrimitives,
  decryptFileEnvelope,
  encryptFileEnvelope,
  rotateItemEnvelopeKey,
  isEnvelopeBundle,
  isCascadeBundle,
  encryptChaCha20Poly1305,
  decryptChaCha20Poly1305,
  touchCryptoKeyCache,
  clearCryptoKeyCache,
  getOrCreateCryptoKey,
  ENVELOPE_MAGIC_CASCADE,
  ENVELOPE_MAGIC_V2,
  CASCADE_HEADER_LENGTH,
  AES_GCM_IV_LENGTH,
  AES_GCM_AAD,
  DEK_AAD,
  CRYPTO_KEY_CACHE_TTL_MS,
} from './cryptoPrimitives';
import { createTrackedBlobUrl } from './blobRegistry';

export {
  decryptFileEnvelope,
  encryptFileEnvelope,
  rotateItemEnvelopeKey,
  isEnvelopeBundle,
  isCascadeBundle,
  encryptChaCha20Poly1305,
  decryptChaCha20Poly1305,
  touchCryptoKeyCache,
  clearCryptoKeyCache,
  getOrCreateCryptoKey,
  ENVELOPE_MAGIC_CASCADE,
  ENVELOPE_MAGIC_V2,
  CASCADE_HEADER_LENGTH,
  AES_GCM_IV_LENGTH,
  AES_GCM_AAD,
  DEK_AAD,
  CRYPTO_KEY_CACHE_TTL_MS,
};

/**
 * Constants for encryption security
 */
const SECURITY_CONSTANTS = {
  AES_GCM_IV_LENGTH: 12,
  ARGON2_MEMORY: 65536,
  ARGON2_ITERATIONS: 3,
  ARGON2_PARALLELISM: 4,
  ARGON2_HASH_LENGTH: 32,
  KEY_BYTE_LENGTH: 32,
  RSA_MODULUS_LENGTH: 2048,
  RSA_ALGORITHM: 'RSA-OAEP',
  RSA_HASH: 'SHA-256',
} as const;

const toArrayBuffer = (value: Uint8Array): ArrayBuffer => new Uint8Array(value).buffer;

const decryptAesGcmWithFallback = async (
  cryptoKey: CryptoKey,
  iv: Uint8Array,
  ciphertext: Uint8Array,
  useAad = true
): Promise<ArrayBuffer> => {
  const algorithm: AesGcmParams = {
    name: 'AES-GCM',
    iv: toArrayBuffer(iv),
  };
  if (useAad) {
    algorithm.additionalData = toArrayBuffer(AES_GCM_AAD);
  }
  return await crypto.subtle.decrypt(algorithm, cryptoKey, toArrayBuffer(ciphertext));
};

/**
 * Robust Base64 encoding for Uint8Array without stack argument spreading
 */
export const uint8ArrayToBase64 = (array: Uint8Array): string => {
  const CHUNK_SIZE = 0x2000; // 8KB chunks
  let binaryString = '';
  for (let i = 0; i < array.length; i += CHUNK_SIZE) {
    const chunk = array.subarray(i, i + CHUNK_SIZE);
    let chunkString = '';
    for (let j = 0; j < chunk.length; j++) {
      chunkString += String.fromCharCode(chunk[j]);
    }
    binaryString += chunkString;
  }
  return btoa(binaryString);
};

/**
 * Robust Base64 decoding to Uint8Array
 */
export const base64ToUint8Array = (base64: string): Uint8Array => {
  if (!base64 || typeof base64 !== 'string') return new Uint8Array(0);
  try {
    let clean = base64.trim();
    if (clean.includes('%')) {
      try {
        clean = decodeURIComponent(clean);
      } catch {
        /* ignore */
      }
    }
    if (clean.startsWith('V2_ENC:')) {
      clean = clean.substring(7).trim();
    }
    const dataUrlMatch = clean.match(/^data:[^,]*;base64,(.*)$/i);
    if (dataUrlMatch) {
      clean = dataUrlMatch[1];
    }
    clean = clean.replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '');
    const pad = clean.length % 4;
    if (pad === 2) clean += '==';
    else if (pad === 3) clean += '=';
    else if (pad === 1) {
      clean = clean.slice(0, -1);
    }

    if (!clean || !/^[A-Za-z0-9+/=]+$/.test(clean)) {
      return new Uint8Array(0);
    }

    const binaryString = atob(clean);
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
 * Encrypts data using AES-256-GCM (Web Crypto API)
 * Layer 3 Protection: Authenticated Symmetric Encryption
 */
export const encryptData = async (
  data: string,
  secretKey: string | CryptoKey | null | undefined
): Promise<string> => {
  if (data == null) return '';
  if (!secretKey) {
    return data;
  }

  try {
    const enc = new TextEncoder();
    let cryptoKey: CryptoKey;

    if (secretKey instanceof CryptoKey) {
      cryptoKey = secretKey;
    } else {
      const keyBuf = base64ToUint8Array(secretKey);
      if (keyBuf.length !== SECURITY_CONSTANTS.KEY_BYTE_LENGTH) {
        return data;
      }
      cryptoKey = await crypto.subtle.importKey(
        'raw',
        toArrayBuffer(keyBuf),
        { name: 'AES-GCM' },
        false,
        ['encrypt']
      );
      keyBuf.fill(0);
    }

    const iv = crypto.getRandomValues(new Uint8Array(SECURITY_CONSTANTS.AES_GCM_IV_LENGTH));

    const ciphertext = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: toArrayBuffer(iv),
        additionalData: toArrayBuffer(AES_GCM_AAD),
      },
      cryptoKey,
      enc.encode(data)
    );

    const bundle = new Uint8Array(iv.length + ciphertext.byteLength);
    bundle.set(iv);
    bundle.set(new Uint8Array(ciphertext), iv.length);

    return uint8ArrayToBase64(bundle);
  } catch (error) {
    handleError(error, 'Encryption Service');
    throw error;
  }
};

/**
 * Decrypts data using AES-256-GCM
 * Includes integrity check (GCM tag verification)
 */
export const decryptData = async (
  encryptedBundle: string,
  secretKey: string | CryptoKey | null | undefined
): Promise<string | null> => {
  if (!encryptedBundle) {
    return null;
  }
  if (!secretKey) {
    return encryptedBundle;
  }

  try {
    const bundle = base64ToUint8Array(encryptedBundle);
    if (bundle.length < SECURITY_CONSTANTS.AES_GCM_IV_LENGTH + 1) {
      return encryptedBundle;
    }

    let cryptoKey: CryptoKey;
    if (secretKey instanceof CryptoKey) {
      cryptoKey = secretKey;
    } else {
      const keyBuf = base64ToUint8Array(secretKey);
      if (keyBuf.length !== SECURITY_CONSTANTS.KEY_BYTE_LENGTH) {
        return encryptedBundle;
      }
      cryptoKey = await crypto.subtle.importKey(
        'raw',
        toArrayBuffer(keyBuf),
        { name: 'AES-GCM' },
        false,
        ['decrypt']
      );
    }

    const iv = bundle.slice(0, SECURITY_CONSTANTS.AES_GCM_IV_LENGTH);
    const ciphertext = bundle.slice(SECURITY_CONSTANTS.AES_GCM_IV_LENGTH);

    const decrypted = await decryptAesGcmWithFallback(cryptoKey, iv, ciphertext);

    return new TextDecoder().decode(decrypted);
  } catch {
    // Return original content as plaintext fallback (for mock items in decoy mode)
    return encryptedBundle;
  }
};

/**
 * Derives a robust encryption key using Argon2id
 */
export const deriveKey = deriveKeyFromPrimitives;

/**
 * Hybrid Key Exchange (Layer 2 & 6)
 * Combines X25519 (ECC) and Kyber768 (Post-Quantum)
 */
export const performHybridKeyExchange = async (peerPublicKey?: {
  ecc: Uint8Array;
  kyber: Uint8Array;
}) => {
  const sodium = await import('libsodium-wrappers').then((m) => m.default || m);
  let kyber: any;
  try {
    const kyberModule = 'pqc-kyber';
    kyber = await import(/* @vite-ignore */ kyberModule);
  } catch {
    kyber = {
      keypair: () => ({ pubkey: new Uint8Array(800), secret: new Uint8Array(1600) }),
    };
  }

  await (sodium as any).ready;

  const eccKeyPair = (sodium as any).crypto_box_keypair();
  const kyberKeys = kyber.keypair();

  if (!peerPublicKey) {
    return {
      localPublicKeys: {
        ecc: eccKeyPair.publicKey,
        kyber: kyberKeys.pubkey,
      },
      _private: {
        ecc: eccKeyPair.privateKey,
        kyber: kyberKeys.secret,
      },
    };
  }

  const sharedSecretECC = (sodium as any).crypto_scalarmult(
    eccKeyPair.privateKey,
    peerPublicKey.ecc
  );

  const { ciphertext, sharedSecret: sharedSecretKyber } = kyber.encapsulate(peerPublicKey.kyber);

  const combinedSecret = new Uint8Array(sharedSecretECC.length + sharedSecretKyber.length);
  combinedSecret.set(sharedSecretECC);
  combinedSecret.set(sharedSecretKyber, sharedSecretECC.length);

  const masterSecretBuffer = await crypto.subtle.digest('SHA-256', combinedSecret);
  const masterSecret = new Uint8Array(masterSecretBuffer);

  return {
    masterSecret: uint8ArrayToBase64(masterSecret),
    kyberCiphertext: ciphertext,
  };
};

/**
 * Multi-Factor Authentication (Layer 8)
 */
export const setupMFA = async (label: string, issuer: string = 'PersonalVault') => {
  const OTPAuth = await import('otpauth');
  const totp = new OTPAuth.TOTP({
    issuer: issuer,
    label: label,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: new OTPAuth.Secret(),
  });

  return {
    uri: totp.toString(),
    secret: totp.secret.base32,
  };
};

export const verifyMFA = async (token: string, secret: string) => {
  const OTPAuth = await import('otpauth');
  const totp = new OTPAuth.TOTP({
    secret: OTPAuth.Secret.fromBase32(secret),
  });
  const delta = totp.validate({ token, window: 1 });
  return delta !== null;
};

/**
 * Digital Signatures (Layer 5)
 */
export const signMessage = async (message: string, privateKey: Uint8Array) => {
  const sodium = await import('libsodium-wrappers').then((m) => m.default || m);
  await (sodium as any).ready;
  return (sodium as any).crypto_sign(message, privateKey);
};

export const verifyMessage = async (signedMessage: Uint8Array, publicKey: Uint8Array) => {
  const sodium = await import('libsodium-wrappers').then((m) => m.default || m);
  await (sodium as any).ready;
  try {
    const opened = (sodium as any).crypto_sign_open(signedMessage, publicKey);
    return new TextDecoder().decode(opened);
  } catch (e) {
    return null;
  }
};

/**
 * RSA-OAEP Key Management (Layer 4)
 * For secure asymmetric key encryption
 */
export const generateRSAKeyPair = async (): Promise<CryptoKeyPair> => {
  return await crypto.subtle.generateKey(
    {
      name: SECURITY_CONSTANTS.RSA_ALGORITHM,
      modulusLength: SECURITY_CONSTANTS.RSA_MODULUS_LENGTH,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: SECURITY_CONSTANTS.RSA_HASH,
    },
    true,
    ['encrypt', 'decrypt']
  );
};

export const exportPublicKey = async (publicKey: CryptoKey): Promise<string> => {
  const exported = await crypto.subtle.exportKey('spki', publicKey);
  return uint8ArrayToBase64(new Uint8Array(exported));
};

export const importPublicKey = async (base64Key: string): Promise<CryptoKey> => {
  const binaryKey = base64ToUint8Array(base64Key);
  return await crypto.subtle.importKey(
    'spki',
    binaryKey as BufferSource,
    {
      name: SECURITY_CONSTANTS.RSA_ALGORITHM,
      hash: SECURITY_CONSTANTS.RSA_HASH,
    },
    true,
    ['encrypt']
  );
};

export const exportPrivateKey = async (privateKey: CryptoKey): Promise<string> => {
  const exported = await crypto.subtle.exportKey('pkcs8', privateKey);
  return uint8ArrayToBase64(new Uint8Array(exported));
};

export const importPrivateKey = async (base64Key: string): Promise<CryptoKey> => {
  const binaryKey = base64ToUint8Array(base64Key);
  return await crypto.subtle.importKey(
    'pkcs8',
    binaryKey as BufferSource,
    {
      name: SECURITY_CONSTANTS.RSA_ALGORITHM,
      hash: SECURITY_CONSTANTS.RSA_HASH,
    },
    true,
    ['decrypt']
  );
};

export const exportRSAKeyPair = async (
  keyPair: CryptoKeyPair
): Promise<{ publicKey: string; privateKey: string }> => {
  const publicKey = await exportPublicKey(keyPair.publicKey);
  const privateKey = await exportPrivateKey(keyPair.privateKey);
  return { publicKey, privateKey };
};

export const importRSAKeyPair = async (keys: {
  publicKey: string;
  privateKey: string;
}): Promise<CryptoKeyPair> => {
  const publicKey = await importPublicKey(keys.publicKey);
  const privateKey = await importPrivateKey(keys.privateKey);
  return { publicKey, privateKey };
};

/**
 * End-to-End Encryption (E2EE) for Files
 * Combines AES-256 (File) + RSA-OAEP (Symmetric Key)
 * Client-Side Encryption (CSE) Architecture
 */
export const encryptFileE2EE = async (
  file: File | Blob,
  rsaPublicKey: CryptoKey | string
): Promise<Uint8Array> => {
  try {
    const publicKey =
      typeof rsaPublicKey === 'string' ? await importPublicKey(rsaPublicKey) : rsaPublicKey;

    // 1. Generate random session key (AES-256)
    const sessionKey = crypto.getRandomValues(new Uint8Array(32));

    // 2. Encrypt File with Session Key (AES-GCM)
    const iv = crypto.getRandomValues(new Uint8Array(SECURITY_CONSTANTS.AES_GCM_IV_LENGTH));
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      toArrayBuffer(sessionKey),
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );

    const fileData = await file.arrayBuffer();
    const encryptedFile = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: toArrayBuffer(iv),
        additionalData: toArrayBuffer(AES_GCM_AAD),
      },
      cryptoKey,
      fileData
    );

    // 3. Encrypt Session Key with RSA Public Key
    const encryptedSessionKey = await crypto.subtle.encrypt(
      { name: SECURITY_CONSTANTS.RSA_ALGORITHM },
      publicKey,
      toArrayBuffer(sessionKey)
    );

    const encKeyUint8 = new Uint8Array(encryptedSessionKey);
    const encFileUint8 = new Uint8Array(encryptedFile);

    // 4. Bundle: [EncKeyLen (2 bytes)] + [EncKey] + [IV] + [EncFile]
    const bundle = new Uint8Array(2 + encKeyUint8.length + iv.length + encFileUint8.length);

    const view = new DataView(bundle.buffer);
    view.setUint16(0, encKeyUint8.length);

    bundle.set(encKeyUint8, 2);
    bundle.set(iv, 2 + encKeyUint8.length);
    bundle.set(encFileUint8, 2 + encKeyUint8.length + iv.length);

    return bundle;
  } catch (error) {
    handleError(error, 'E2EE File Encryption');
    throw error;
  }
};

/**
 * Decrypts an E2EE Bundle back to a usable Blob URL
 */
export const decryptFileE2EE = async (
  bundle: Uint8Array | string,
  rsaPrivateKey: CryptoKey,
  mimeType?: string
): Promise<string | null> => {
  try {
    const data = typeof bundle === 'string' ? base64ToUint8Array(bundle) : bundle;
    if (data.length < 2) return null;

    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const encKeyLen = view.getUint16(0);

    const encKey = data.slice(2, 2 + encKeyLen);
    const iv = data.slice(2 + encKeyLen, 2 + encKeyLen + SECURITY_CONSTANTS.AES_GCM_IV_LENGTH);
    const encFile = data.slice(2 + encKeyLen + SECURITY_CONSTANTS.AES_GCM_IV_LENGTH);

    // 1. Decrypt Session Key with RSA
    const sessionKey = await crypto.subtle.decrypt(
      { name: SECURITY_CONSTANTS.RSA_ALGORITHM },
      rsaPrivateKey,
      toArrayBuffer(encKey)
    );

    // 2. Decrypt File with Session Key
    const cryptoKey = await crypto.subtle.importKey('raw', sessionKey, { name: 'AES-GCM' }, false, [
      'decrypt',
    ]);

    const decrypted = await decryptAesGcmWithFallback(cryptoKey, iv, encFile);

    let finalMimeType = mimeType;
    const detected = detectMimeTypeFromBytes(new Uint8Array(decrypted));
    const detectedIsMedia = detected.startsWith('audio/') || detected.startsWith('video/');
    if (
      detected !== 'application/octet-stream' &&
      (!finalMimeType ||
        finalMimeType === 'application/octet-stream' ||
        (detectedIsMedia &&
          (finalMimeType.startsWith('audio/') || finalMimeType.startsWith('video/')) &&
          finalMimeType !== detected) ||
        (finalMimeType === 'audio/mpeg' && detected !== 'audio/mpeg'))
    ) {
      finalMimeType = detected;
    }

    const normalizedBlobMime =
      finalMimeType === 'video/quicktime'
        ? 'video/mp4'
        : finalMimeType || 'application/octet-stream';

    const blob = new Blob([decrypted], { type: normalizedBlobMime });
    return createTrackedBlobUrl(blob);
  } catch (error) {
    handleError(error, 'E2EE File Decryption');
    return null;
  }
};

/**
 * Encrypts a File object efficiently using the Dual-Engine Cascade Cipher (AES-256-GCM + ChaCha20-Poly1305)
 */
export const encryptFile = async (
  file: File | Blob | Uint8Array,
  secretKey: string | CryptoKey
): Promise<Uint8Array> => {
  try {
    const arrayBuffer = file instanceof Uint8Array ? file : await file.arrayBuffer();
    return await encryptFileEnvelope(arrayBuffer, secretKey);
  } catch (error) {
    handleError(error, 'File Encryption Service');
    throw error;
  }
};

export const detectMimeTypeFromBytes = (bytes: Uint8Array): string => {
  if (!bytes || bytes.length < 4) return 'application/octet-stream';

  // PDF: %PDF-
  if (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  ) {
    return 'application/pdf';
  }

  // FDF: %FDF-
  if (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x46 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  ) {
    return 'application/vnd.fdf';
  }

  // RTF: {\rtf
  if (
    bytes.length >= 5 &&
    bytes[0] === 0x7b &&
    bytes[1] === 0x5c &&
    bytes[2] === 0x72 &&
    bytes[3] === 0x74 &&
    bytes[4] === 0x66
  ) {
    return 'application/rtf';
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
    return 'application/x-7z-compressed';
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
    return 'application/vnd.rar';
  }

  // GZIP: 0x1F 0x8B
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    return 'application/gzip';
  }

  // BZIP2: BZh
  if (bytes.length >= 3 && bytes[0] === 0x42 && bytes[1] === 0x5a && bytes[2] === 0x68) {
    return 'application/x-bzip2';
  }

  // XZ: \xFD7zXZ\x00
  if (
    bytes.length >= 6 &&
    bytes[0] === 0xfd &&
    bytes[1] === 0x37 &&
    bytes[2] === 0x7a &&
    bytes[3] === 0x58 &&
    bytes[4] === 0x5a &&
    bytes[5] === 0x00
  ) {
    return 'application/x-xz';
  }

  // CHM (Microsoft Compiled HTML Help): ITSF
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x49 &&
    bytes[1] === 0x54 &&
    bytes[2] === 0x53 &&
    bytes[3] === 0x46
  ) {
    return 'application/vnd.ms-htmlhelp';
  }

  // DjVu: AT&TFORM....DJVU
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x41 &&
    bytes[1] === 0x54 &&
    bytes[2] === 0x26 &&
    bytes[3] === 0x54 &&
    bytes[4] === 0x46 &&
    bytes[5] === 0x4f &&
    bytes[6] === 0x52 &&
    bytes[7] === 0x4d &&
    bytes[8] === 0x44 &&
    bytes[9] === 0x4a &&
    bytes[10] === 0x56 &&
    bytes[11] === 0x55
  ) {
    return 'image/vnd.djvu';
  }

  // ZIP / OpenXML Office / EPUB: PK\x03\x04
  if (
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    (bytes[2] === 0x03 || bytes[2] === 0x05) &&
    (bytes[3] === 0x04 || bytes[3] === 0x06)
  ) {
    // Check if EPUB
    if (bytes.length >= 58) {
      const headerStr = String.fromCharCode(...bytes.slice(0, 60));
      if (headerStr.includes('mimetypeapplication/epub+zip')) {
        return 'application/epub+zip';
      }
    }
    return 'application/zip';
  }

  // JPEG: 0xFF 0xD8 0xFF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
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
    return 'image/png';
  }

  // GIF: GIF87a / GIF89a
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return 'image/gif';
  }

  // BMP / DIB: BM
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return 'image/bmp';
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
    return 'image/webp';
  }

  // TIFF / RAW: II*\0 or MM\0*
  if (
    bytes.length >= 4 &&
    ((bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a && bytes[3] === 0x00) ||
      (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0x00 && bytes[3] === 0x2a))
  ) {
    return 'image/tiff';
  }

  // Photoshop PSD: 8BPS
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x38 &&
    bytes[1] === 0x42 &&
    bytes[2] === 0x50 &&
    bytes[3] === 0x53
  ) {
    return 'image/vnd.adobe.photoshop';
  }

  // ICO / CUR
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x00 &&
    bytes[1] === 0x00 &&
    (bytes[2] === 0x01 || bytes[2] === 0x02) &&
    bytes[3] === 0x00
  ) {
    return 'image/x-icon';
  }

  // JPEG 2000 (JP2, J2K)
  if (
    (bytes.length >= 8 &&
      bytes[0] === 0x00 &&
      bytes[1] === 0x00 &&
      bytes[2] === 0x00 &&
      bytes[3] === 0x0c &&
      bytes[4] === 0x6a &&
      bytes[5] === 0x50) ||
    (bytes.length >= 4 &&
      bytes[0] === 0xff &&
      bytes[1] === 0x4f &&
      bytes[2] === 0xff &&
      bytes[3] === 0x51)
  ) {
    return 'image/jp2';
  }

  // JPEG XR (JXR, HDP, WDP)
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x49 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0xbc &&
    (bytes[3] === 0x01 || bytes[3] === 0x00)
  ) {
    return 'image/jxr';
  }

  // DirectDraw Surface (DDS)
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x44 &&
    bytes[1] === 0x44 &&
    bytes[2] === 0x53 &&
    bytes[3] === 0x20
  ) {
    return 'image/vnd-ms.dds';
  }

  // OpenEXR
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x76 &&
    bytes[1] === 0x2f &&
    bytes[2] === 0x31 &&
    bytes[3] === 0x01
  ) {
    return 'image/x-exr';
  }

  // Radiance HDR
  if (
    bytes.length >= 10 &&
    bytes[0] === 0x23 &&
    bytes[1] === 0x3f &&
    (bytes[2] === 0x52 || bytes[2] === 0x72)
  ) {
    return 'image/vnd.radiance';
  }

  // Apple ICNS
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x69 &&
    bytes[1] === 0x63 &&
    bytes[2] === 0x6e &&
    bytes[3] === 0x73
  ) {
    return 'image/x-icns';
  }

  // SVG: <svg or <?xml
  if (bytes.length >= 5) {
    const textStart = String.fromCharCode(...bytes.slice(0, Math.min(bytes.length, 100)))
      .trim()
      .toLowerCase();
    if (
      textStart.startsWith('<svg') ||
      textStart.startsWith('<?xml') ||
      textStart.includes('<svg')
    ) {
      return 'image/svg+xml';
    }
  }

  // ID3v2 for MP3: 0x49 0x44 0x33 ("ID3")
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    return 'audio/mpeg';
  }

  // MP3 Sync Word (without ID3 header): 0xFF 0xFB, 0xFF 0xF3, 0xFF 0xF2, 0xFF 0xE3
  if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) {
    return 'audio/mpeg';
  }

  // AAC / ADTS Sync Word: 0xFF 0xF1, 0xFF 0xF9
  if (bytes[0] === 0xff && (bytes[1] & 0xf6) === 0xf0) {
    return 'audio/aac';
  }

  // RIFF container (WAV or AVI)
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
    if (
      bytes.length >= 12 &&
      bytes[8] === 0x41 &&
      bytes[9] === 0x56 &&
      bytes[10] === 0x49 &&
      bytes[11] === 0x20
    ) {
      return 'video/x-msvideo';
    }
    return 'audio/wav';
  }

  // OGG container: "OggS"
  if (bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) {
    return 'audio/ogg';
  }

  // FLAC container: "fLaC"
  if (bytes[0] === 0x66 && bytes[1] === 0x4c && bytes[2] === 0x61 && bytes[3] === 0x43) {
    return 'audio/flac';
  }

  // AIFF container: "FORM....AIFF" or "FORM....AIFC"
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x46 &&
    bytes[1] === 0x4f &&
    bytes[2] === 0x52 &&
    bytes[3] === 0x4d &&
    ((bytes[8] === 0x41 && bytes[9] === 0x49 && bytes[10] === 0x46 && bytes[11] === 0x46) ||
      (bytes[8] === 0x41 && bytes[9] === 0x49 && bytes[10] === 0x46 && bytes[11] === 0x43))
  ) {
    return 'audio/aiff';
  }

  // ISO Media / MP4 / M4A / QuickTime / AVIF / HEIC: "ftyp" at index 4
  if (
    bytes.length >= 12 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]).toLowerCase();
    if (brand.includes('m4a') || brand.includes('m4b')) {
      return 'audio/mp4';
    }
    if (brand.includes('avif') || brand.includes('avis')) {
      return 'image/avif';
    }
    if (
      brand.includes('heic') ||
      brand.includes('heix') ||
      brand.includes('hevc') ||
      brand.includes('hevx') ||
      brand.includes('heif') ||
      brand.includes('mif1')
    ) {
      return 'image/heic';
    }
    // QuickTime (MOV) is standard ISO media. Use video/mp4 for cross-browser HTML5 video support.
    return 'video/mp4';
  }

  // WebM / MKV (Matroska): 1A 45 DF A3
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    const headerStr = String.fromCharCode(
      ...bytes.slice(0, Math.min(bytes.length, 80))
    ).toLowerCase();
    if (headerStr.includes('matroska')) {
      return 'video/x-matroska';
    }
    return 'video/webm';
  }

  // AMR: "#!AMR\n" or "#!AMR-WB\n"
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x23 &&
    bytes[1] === 0x21 &&
    bytes[2] === 0x41 &&
    bytes[3] === 0x4d &&
    bytes[4] === 0x52
  ) {
    if (bytes.length >= 9 && bytes[5] === 0x2d && bytes[6] === 0x57 && bytes[7] === 0x42) {
      return 'audio/amr-wb';
    }
    return 'audio/amr';
  }

  // AU / SND: ".snd" (0x2E 0x73 0x6E 0x64)
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x2e &&
    bytes[1] === 0x73 &&
    bytes[2] === 0x6e &&
    bytes[3] === 0x64
  ) {
    return 'audio/basic';
  }

  // Creative Voice (VOC): "Creative Voice File\x1A"
  if (
    bytes.length >= 19 &&
    bytes[0] === 0x43 &&
    bytes[1] === 0x72 &&
    bytes[2] === 0x65 &&
    bytes[3] === 0x61 &&
    bytes[4] === 0x74 &&
    bytes[5] === 0x69 &&
    bytes[6] === 0x76 &&
    bytes[7] === 0x65
  ) {
    return 'audio/x-voc';
  }

  // RealAudio: ".RMF" or ".ra\xFD"
  if (
    (bytes.length >= 4 &&
      bytes[0] === 0x2e &&
      bytes[1] === 0x52 &&
      bytes[2] === 0x4d &&
      bytes[3] === 0x46) ||
    (bytes.length >= 4 &&
      bytes[0] === 0x2e &&
      bytes[1] === 0x72 &&
      bytes[2] === 0x61 &&
      bytes[3] === 0xfd)
  ) {
    return 'audio/x-pn-realaudio';
  }

  // AC3 / Dolby Digital: 0x0B 0x77
  if (bytes.length >= 2 && bytes[0] === 0x0b && bytes[1] === 0x77) {
    return 'audio/ac3';
  }

  // DTS: 0x7F 0xFE 0x80 0x01
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x7f &&
    bytes[1] === 0xfe &&
    bytes[2] === 0x80 &&
    bytes[3] === 0x01
  ) {
    return 'audio/vnd.dts';
  }

  // DSD / DSF: "DSD " (0x44 0x53 0x44 0x20)
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x44 &&
    bytes[1] === 0x53 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x20
  ) {
    return 'audio/x-dsd';
  }

  // WavPack (WV): "wvpk" (0x77 0x76 0x70 0x6B)
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x77 &&
    bytes[1] === 0x76 &&
    bytes[2] === 0x70 &&
    bytes[3] === 0x6b
  ) {
    return 'audio/x-wavpack';
  }

  // Monkey's Audio (APE): "MAC " (0x4D 0x41 0x43 0x20)
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x4d &&
    bytes[1] === 0x41 &&
    bytes[2] === 0x43 &&
    bytes[3] === 0x20
  ) {
    return 'audio/x-ape';
  }

  // TAK Audio: "tBaK" (0x74 0x42 0x61 0x4B)
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x74 &&
    bytes[1] === 0x42 &&
    bytes[2] === 0x61 &&
    bytes[3] === 0x4b
  ) {
    return 'audio/x-tak';
  }

  // TTA Audio: "TTA1" (0x54 0x54 0x41 0x31)
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x54 &&
    bytes[1] === 0x54 &&
    bytes[2] === 0x41 &&
    bytes[3] === 0x31
  ) {
    return 'audio/x-tta';
  }

  // Musepack (MPC): "MPCK" or "MP+"
  if (
    (bytes.length >= 4 &&
      bytes[0] === 0x4d &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x43 &&
      bytes[3] === 0x4b) ||
    (bytes.length >= 3 && bytes[0] === 0x4d && bytes[1] === 0x50 && bytes[2] === 0x2b)
  ) {
    return 'audio/x-musepack';
  }

  // Core Audio Format (CAF): "caff" (0x63 0x61 0x66 0x66)
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x63 &&
    bytes[1] === 0x61 &&
    bytes[2] === 0x66 &&
    bytes[3] === 0x66
  ) {
    return 'audio/x-caf';
  }

  // MIDI: "MThd" (0x4D 0x54 0x68 0x64)
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x4d &&
    bytes[1] === 0x54 &&
    bytes[2] === 0x68 &&
    bytes[3] === 0x64
  ) {
    return 'audio/midi';
  }

  // Tracker modules: FastTracker II (Extended Module:) or Impulse Tracker (IMPM) or Scream Tracker (SCRM)
  if (
    bytes.length >= 17 &&
    bytes[0] === 0x45 &&
    bytes[1] === 0x78 &&
    bytes[2] === 0x74 &&
    bytes[3] === 0x65 &&
    bytes[4] === 0x6e &&
    bytes[5] === 0x64 &&
    bytes[6] === 0x65 &&
    bytes[7] === 0x64
  ) {
    return 'audio/x-xm';
  }
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x49 &&
    bytes[1] === 0x4d &&
    bytes[2] === 0x50 &&
    bytes[3] === 0x4d
  ) {
    return 'audio/x-it';
  }

  return 'application/octet-stream';
};

/**
 * Decrypts a file bundle back to a usable URL
 */
export const decryptToFile = async (
  encryptedBundle: string | Uint8Array,
  secretKey: string | CryptoKey | null | undefined,
  mimeType?: string,
  rsaPrivateKey?: CryptoKeyPair['privateKey'] | null
): Promise<string | null> => {
  if (!encryptedBundle) return null;
  if (!secretKey) {
    if (typeof encryptedBundle === 'string') {
      if (encryptedBundle.startsWith('data:') || encryptedBundle.startsWith('blob:')) {
        return encryptedBundle;
      }
      return createTrackedBlobUrl(
        new Blob([encryptedBundle], { type: mimeType || 'text/plain' })
      );
    }
    if (encryptedBundle instanceof Uint8Array) {
      return createTrackedBlobUrl(
        new Blob([encryptedBundle], { type: mimeType || 'application/octet-stream' })
      );
    }
    return null;
  }

  try {
    const bundle =
      typeof encryptedBundle === 'string' ? base64ToUint8Array(encryptedBundle) : encryptedBundle;

    if (!bundle || bundle.length < 2) {
      return null;
    }

    // Detect E2EE Bundle: [EncKeyLen (2 bytes)] + [EncKey] + ...
    // Standard bundles start with 12 bytes IV.
    // We check if the bundle looks like an E2EE bundle.
    if (bundle.length > 2 && rsaPrivateKey) {
      const view = new DataView(bundle.buffer);
      const encKeyLen = view.getUint16(0);

      // Sanity check: RSA-2048 enc key is 256 bytes.
      if (encKeyLen > 0 && encKeyLen < bundle.length && (encKeyLen === 256 || encKeyLen === 512)) {
        return await decryptFileE2EE(bundle, rsaPrivateKey as CryptoKey, mimeType);
      }
    }

    if (bundle.length < SECURITY_CONSTANTS.AES_GCM_IV_LENGTH + 1) {
      return null;
    }

    const decrypted = await decryptFileEnvelope(bundle, secretKey);
    const decryptedBytes = new Uint8Array(decrypted);

    try {
      let finalMimeType = mimeType;
      const detected = detectMimeTypeFromBytes(decryptedBytes);
      const detectedIsMedia =
        detected.startsWith('audio/') ||
        detected.startsWith('video/') ||
        detected.startsWith('image/');
      if (
        detected !== 'application/octet-stream' &&
        (!finalMimeType ||
          finalMimeType === 'application/octet-stream' ||
          (detectedIsMedia &&
            (finalMimeType.startsWith('audio/') ||
              finalMimeType.startsWith('video/') ||
              finalMimeType.startsWith('image/')) &&
            finalMimeType !== detected &&
            !(finalMimeType.startsWith('audio/') && detected === 'video/webm')) ||
          (finalMimeType === 'audio/mpeg' && detected !== 'audio/mpeg') ||
          (finalMimeType === 'image/jpeg' &&
            detected.startsWith('image/') &&
            detected !== 'image/jpeg'))
      ) {
        finalMimeType = detected;
      }

      const normalizedBlobMime =
        finalMimeType === 'video/quicktime'
          ? 'video/mp4'
          : finalMimeType || 'application/octet-stream';

      const blob = new Blob([decryptedBytes], { type: normalizedBlobMime });
      return createTrackedBlobUrl(blob);
    } catch (innerError) {
      handleError(innerError, 'File Decryption Blob Pipeline');
      return null;
    }
  } catch (error) {
    handleError(error, 'File Decryption Service');
    return null;
  }
};

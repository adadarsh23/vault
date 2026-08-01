import { handleError } from './error-handler';
import { deriveKey as deriveKeyFromPrimitives } from './cryptoPrimitives';

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
  RSA_ALGORITHM: "RSA-OAEP",
  RSA_HASH: "SHA-256",
} as const;
const AES_GCM_AAD = new TextEncoder().encode('vault:e2ee:aes-gcm:v2');

const toArrayBuffer = (value: Uint8Array): ArrayBuffer =>
  new Uint8Array(value).buffer;

const decryptAesGcmWithFallback = async (
  cryptoKey: CryptoKey,
  iv: Uint8Array,
  ciphertext: Uint8Array,
): Promise<ArrayBuffer> => {
  try {
    return await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: toArrayBuffer(iv),
        additionalData: toArrayBuffer(AES_GCM_AAD),
      },
      cryptoKey,
      toArrayBuffer(ciphertext),
    );
  } catch {
    return await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: toArrayBuffer(iv) },
      cryptoKey,
      toArrayBuffer(ciphertext),
    );
  }
};

/**
 * Robust Base64 encoding for Uint8Array
 */
export const uint8ArrayToBase64 = (array: Uint8Array): string => {
  const CHUNK_SIZE = 0x8000; // 32KB
  let binaryString = '';
  for (let i = 0; i < array.length; i += CHUNK_SIZE) {
    binaryString += String.fromCharCode(...(array.subarray(i, i + CHUNK_SIZE) as any));
  }
  return btoa(binaryString);
};

/**
 * Robust Base64 decoding to Uint8Array 
 */
export const base64ToUint8Array = (base64: string): Uint8Array => {
  if (!base64) return new Uint8Array(0);
  try {
    const binaryString = atob(base64.trim());
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  } catch (e) {
    console.error("Base64 decoding failed", e);
    return new Uint8Array(0);
  }
};

/**
 * Encrypts data using AES-256-GCM (Web Crypto API)
 * Layer 3 Protection: Authenticated Symmetric Encryption
 */
export const encryptData = async (data: string, secretKey: string | CryptoKey): Promise<string> => {
  if (data == null || !secretKey) {
    throw new Error("Encryption Error: Missing data or secret key");
  }
  
  try {
    const enc = new TextEncoder();
    let cryptoKey: CryptoKey;
    
    if (secretKey instanceof CryptoKey) {
      cryptoKey = secretKey;
    } else {
      const keyBuf = base64ToUint8Array(secretKey);
      if (keyBuf.length !== SECURITY_CONSTANTS.KEY_BYTE_LENGTH) {
        throw new Error(`Invalid key length: expected ${SECURITY_CONSTANTS.KEY_BYTE_LENGTH} bytes, got ${keyBuf.length}`);
      }
      cryptoKey = await crypto.subtle.importKey(
        "raw",
        toArrayBuffer(keyBuf),
        { name: "AES-GCM" },
        false,
        ["encrypt"]
      );
      keyBuf.fill(0);
    }

    const iv = crypto.getRandomValues(new Uint8Array(SECURITY_CONSTANTS.AES_GCM_IV_LENGTH));

    const ciphertext = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
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
    handleError(error, "Encryption Service");
    throw error;
  }
};

/**
 * Decrypts data using AES-256-GCM
 * Includes integrity check (GCM tag verification)
 */
export const decryptData = async (encryptedBundle: string, secretKey: string | CryptoKey): Promise<string | null> => {
  if (!encryptedBundle || !secretKey) {
    return null;
  }
  
  try {
    const bundle = base64ToUint8Array(encryptedBundle);
    if (bundle.length < SECURITY_CONSTANTS.AES_GCM_IV_LENGTH + 1) {
      return null;
    }

    let cryptoKey: CryptoKey;
    if (secretKey instanceof CryptoKey) {
      cryptoKey = secretKey;
    } else {
      const keyBuf = base64ToUint8Array(secretKey);
      if (keyBuf.length !== SECURITY_CONSTANTS.KEY_BYTE_LENGTH) {
        return null;
      }
      cryptoKey = await crypto.subtle.importKey(
        "raw",
        toArrayBuffer(keyBuf),
        { name: "AES-GCM" },
        false,
        ["decrypt"]
      );
    }
    
    const iv = bundle.slice(0, SECURITY_CONSTANTS.AES_GCM_IV_LENGTH);
    const ciphertext = bundle.slice(SECURITY_CONSTANTS.AES_GCM_IV_LENGTH);

    const decrypted = await decryptAesGcmWithFallback(cryptoKey, iv, ciphertext);

    return new TextDecoder().decode(decrypted);
  } catch (error) {
    // Silent fail for wrong keys is often preferred in crypto libs to prevent timing/probing
    return null;
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
export const performHybridKeyExchange = async (peerPublicKey?: { ecc: Uint8Array, kyber: Uint8Array }) => {
  const sodium = await import('libsodium-wrappers').then(m => m.default || m);
  const kyber = await import('pqc-kyber');
  
  await (sodium as any).ready;
  
  const eccKeyPair = (sodium as any).crypto_box_keypair();
  const kyberKeys = kyber.keypair();

  if (!peerPublicKey) {
    return {
      localPublicKeys: {
        ecc: eccKeyPair.publicKey,
        kyber: kyberKeys.pubkey
      },
      _private: {
        ecc: eccKeyPair.privateKey,
        kyber: kyberKeys.secret
      }
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
    kyberCiphertext: ciphertext
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
    secret: new OTPAuth.Secret()
  });

  return {
    uri: totp.toString(),
    secret: totp.secret.base32
  };
};

export const verifyMFA = async (token: string, secret: string) => {
  const OTPAuth = await import('otpauth');
  const totp = new OTPAuth.TOTP({
    secret: OTPAuth.Secret.fromBase32(secret)
  });
  const delta = totp.validate({ token, window: 1 });
  return delta !== null;
};

/**
 * Digital Signatures (Layer 5)
 */
export const signMessage = async (message: string, privateKey: Uint8Array) => {
  const sodium = await import('libsodium-wrappers').then(m => m.default || m);
  await (sodium as any).ready;
  return (sodium as any).crypto_sign(message, privateKey);
};

export const verifyMessage = async (signedMessage: Uint8Array, publicKey: Uint8Array) => {
  const sodium = await import('libsodium-wrappers').then(m => m.default || m);
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
    ["encrypt", "decrypt"]
  );
};

export const exportPublicKey = async (publicKey: CryptoKey): Promise<string> => {
  const exported = await crypto.subtle.exportKey("spki", publicKey);
  return uint8ArrayToBase64(new Uint8Array(exported));
};

export const importPublicKey = async (base64Key: string): Promise<CryptoKey> => {
  const binaryKey = base64ToUint8Array(base64Key);
  return await crypto.subtle.importKey(
    "spki",
    binaryKey as BufferSource,
    {
      name: SECURITY_CONSTANTS.RSA_ALGORITHM,
      hash: SECURITY_CONSTANTS.RSA_HASH,
    },
    true,
    ["encrypt"]
  );
};

export const exportPrivateKey = async (privateKey: CryptoKey): Promise<string> => {
  const exported = await crypto.subtle.exportKey("pkcs8", privateKey);
  return uint8ArrayToBase64(new Uint8Array(exported));
};

export const importPrivateKey = async (base64Key: string): Promise<CryptoKey> => {
  const binaryKey = base64ToUint8Array(base64Key);
  return await crypto.subtle.importKey(
    "pkcs8",
    binaryKey as BufferSource,
    {
      name: SECURITY_CONSTANTS.RSA_ALGORITHM,
      hash: SECURITY_CONSTANTS.RSA_HASH,
    },
    true,
    ["decrypt"]
  );
};

export const exportRSAKeyPair = async (keyPair: CryptoKeyPair): Promise<{ publicKey: string; privateKey: string }> => {
  const publicKey = await exportPublicKey(keyPair.publicKey);
  const privateKey = await exportPrivateKey(keyPair.privateKey);
  return { publicKey, privateKey };
};

export const importRSAKeyPair = async (keys: { publicKey: string; privateKey: string }): Promise<CryptoKeyPair> => {
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
    const publicKey = typeof rsaPublicKey === 'string' 
      ? await importPublicKey(rsaPublicKey) 
      : rsaPublicKey;

    // 1. Generate random session key (AES-256)
    const sessionKey = crypto.getRandomValues(new Uint8Array(32));
    
    // 2. Encrypt File with Session Key (AES-GCM)
    const iv = crypto.getRandomValues(new Uint8Array(SECURITY_CONSTANTS.AES_GCM_IV_LENGTH));
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      toArrayBuffer(sessionKey),
      { name: "AES-GCM" },
      false,
      ["encrypt"]
    );

    const fileData = await file.arrayBuffer();
    const encryptedFile = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
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
    handleError(error, "E2EE File Encryption");
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

    const view = new DataView(data.buffer);
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
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      sessionKey,
      { name: "AES-GCM" },
      false,
      ["decrypt"]
    );

    const decrypted = await decryptAesGcmWithFallback(
      cryptoKey,
      iv,
      encFile,
    );

    const blob = new Blob([decrypted], { type: mimeType || 'application/octet-stream' });
    return URL.createObjectURL(blob);
  } catch (error) {
    handleError(error, "E2EE File Decryption");
    return null;
  }
};

/**
 * Encrypts a File object efficiently and returns a binary bundle (IV + Ciphertext)
 */
export const encryptFile = async (file: File, secretKey: string | CryptoKey): Promise<Uint8Array> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    
    let cryptoKey: CryptoKey;
    if (secretKey instanceof CryptoKey) {
      cryptoKey = secretKey;
    } else {
      const keyBuf = base64ToUint8Array(secretKey);
      cryptoKey = await crypto.subtle.importKey(
        "raw",
        toArrayBuffer(keyBuf),
        { name: "AES-GCM" },
        false,
        ["encrypt"]
      );
      keyBuf.fill(0);
    }

    const iv = crypto.getRandomValues(new Uint8Array(SECURITY_CONSTANTS.AES_GCM_IV_LENGTH));

    const ciphertext = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: toArrayBuffer(iv),
        additionalData: toArrayBuffer(AES_GCM_AAD),
      },
      cryptoKey,
      toArrayBuffer(data)
    );

    const bundle = new Uint8Array(iv.length + ciphertext.byteLength);
    bundle.set(iv);
    bundle.set(new Uint8Array(ciphertext), iv.length);

    return bundle;
  } catch (error) {
    handleError(error, "File Encryption Service");
    throw error;
  }
};

/**
 * Decrypts a file bundle back to a usable URL
 */
export const decryptToFile = async (
  encryptedBundle: string | Uint8Array,
  secretKey: string | CryptoKey,
  mimeType?: string,
  rsaPrivateKey?: CryptoKeyPair['privateKey'] | null
): Promise<string | null> => {
  if (!encryptedBundle || !secretKey) return null;

  try {
    const bundle = typeof encryptedBundle === 'string' ? base64ToUint8Array(encryptedBundle) : encryptedBundle;
    
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

    let cryptoKey: CryptoKey;
    if (secretKey instanceof CryptoKey) {
      cryptoKey = secretKey;
    } else {
      const keyBuf = base64ToUint8Array(secretKey);
      if (keyBuf.length !== SECURITY_CONSTANTS.KEY_BYTE_LENGTH) {
        return null;
      }
      cryptoKey = await crypto.subtle.importKey(
        "raw",
        toArrayBuffer(keyBuf),
        { name: "AES-GCM" },
        false,
        ["decrypt"],
      );
    }

    const iv = bundle.slice(0, SECURITY_CONSTANTS.AES_GCM_IV_LENGTH);
    const ciphertext = bundle.slice(SECURITY_CONSTANTS.AES_GCM_IV_LENGTH);

    const decrypted = await decryptAesGcmWithFallback(cryptoKey, iv, ciphertext);

    const blob = new Blob([decrypted], { type: mimeType || 'application/octet-stream' });
    return URL.createObjectURL(blob);
  } catch (error) {
    handleError(error, "File Decryption Service");
    return null;
  }
};

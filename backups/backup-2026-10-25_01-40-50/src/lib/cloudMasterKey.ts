import {
  encryptData,
  decryptData,
  uint8ArrayToBase64,
  base64ToUint8Array,
} from './cryptoPrimitives';
import { argon2id } from 'hash-wasm';
import { handleError } from './error-handler';

const sharedTextEncoder = new TextEncoder();

/**
 * Client-side Master Key Cloud Storage
 * Handles encryption/decryption of master key for cloud backup
 */

export interface CloudMasterKeyPayload {
  encryptedMasterKey: {
    cipherText: string;
    iv: string;
    authTag: string;
    salt: string;
    algorithm: string;
    keyVersion: string;
  };
  masterKeyHash: string;
  deviceId: string;
  recoveryPhrasesEncrypted?: string;
  metadata?: {
    derivationAlgorithm: string;
    derivationParams: {
      memory: number;
      iterations: number;
      parallelism: number;
    };
  };
}

export interface RetrievedCloudMasterKey {
  encryptedMasterKey: {
    cipherText: string;
    iv: string;
    authTag: string;
    salt: string;
    algorithm: string;
    keyVersion: string;
  };
  masterKeyHash: string;
}

/**
 * Generate cloud protection key from password and salt
 * Used to encrypt the master key before uploading to cloud
 *
 * @param password - User password
 * @param salt - Base64-encoded salt
 * @returns Base64-encoded 256-bit key
 */
export const generateCloudProtectionKey = async (
  password: string,
  salt: string,
): Promise<string> => {
  try {
    if (!password || !salt) {
      throw new Error('Password and salt are required to generate cloud protection key');
    }

    const saltBuffer = sharedTextEncoder.encode(salt);
    const hashBuffer = (await argon2id({
      password,
      salt: saltBuffer,
      parallelism: 4,
      iterations: 3,
      memorySize: 65536,
      hashLength: 32,
      outputType: 'binary',
    })) as Uint8Array;

    return uint8ArrayToBase64(new Uint8Array(hashBuffer));
  } catch (error) {
    handleError(error, 'generateCloudProtectionKey');
    throw error;
  }
};

/**
 * Encrypt master key for cloud storage
 * Uses AES-256-GCM to protect the master key
 *
 * @param masterKey - Master key to encrypt (base64 format)
 * @param cloudProtectionKey - Key derived from password (base64 format)
 * @param salt - Salt used for key derivation (base64 format)
 * @returns Encrypted master key payload with metadata
 */
export const encryptMasterKeyForCloud = async (
  masterKey: string,
  cloudProtectionKey: string,
  salt: string,
): Promise<CloudMasterKeyPayload['encryptedMasterKey']> => {
  try {
    if (!masterKey || !cloudProtectionKey || !salt) {
      throw new Error('Master key, cloud protection key, and salt are required');
    }

    // Encrypt the master key with AES-256-GCM
    const encryptedBundle = await encryptData(masterKey, cloudProtectionKey);

    // Parse the encrypted bundle to extract components
    const bundleBytes = base64ToUint8Array(encryptedBundle);
    const iv = bundleBytes.subarray(0, 12);
    const ciphertext = bundleBytes.subarray(12, bundleBytes.length - 16);
    const authTag = bundleBytes.subarray(bundleBytes.length - 16);

    return {
      cipherText: uint8ArrayToBase64(ciphertext),
      iv: uint8ArrayToBase64(iv),
      authTag: uint8ArrayToBase64(authTag),
      salt: salt,
      algorithm: 'aes-256-gcm',
      keyVersion: 'v1',
    };
  } catch (error) {
    handleError(error, 'encryptMasterKeyForCloud');
    throw error;
  }
};

/**
 * Decrypt master key from cloud storage
 *
 * @param encryptedPayload - Encrypted master key components
 * @param cloudProtectionKey - Key derived from password (base64 format)
 * @returns Decrypted master key (base64 format)
 */
export const decryptMasterKeyFromCloud = async (
  encryptedPayload: {
    cipherText: string;
    iv: string;
    authTag: string;
  },
  cloudProtectionKey: string,
): Promise<string | null> => {
  try {
    if (!encryptedPayload || !cloudProtectionKey) {
      throw new Error('Encrypted payload and cloud protection key are required');
    }

    // Reconstruct the encrypted bundle from components
    const iv = base64ToUint8Array(encryptedPayload.iv);
    const ciphertext = base64ToUint8Array(encryptedPayload.cipherText);
    const authTag = base64ToUint8Array(encryptedPayload.authTag);

    const bundle = new Uint8Array(iv.length + ciphertext.length + authTag.length);
    bundle.set(iv);
    bundle.set(ciphertext, iv.length);
    bundle.set(authTag, iv.length + ciphertext.length);

    const encryptedBundle = uint8ArrayToBase64(bundle);

    // Decrypt
    return await decryptData(encryptedBundle, cloudProtectionKey);
  } catch (error) {
    handleError(error, 'decryptMasterKeyFromCloud');
    return null;
  }
};

/**
 * Create SHA-256 hash of master key for verification
 *
 * @param masterKey - Master key (base64 format)
 * @returns Base64-encoded SHA-256 hash
 */
export const hashMasterKey = async (masterKey: string): Promise<string> => {
  try {
    if (!masterKey) {
      throw new Error('Master key is required to create hash');
    }

    const data = sharedTextEncoder.encode(masterKey);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return uint8ArrayToBase64(new Uint8Array(hashBuffer));
  } catch (error) {
    handleError(error, 'hashMasterKey');
    throw error;
  }
};

/**
 * Prepare master key payload for cloud upload
 *
 * @param masterKey - Master key (base64 format)
 * @param password - User password
 * @param deviceId - Current device ID
 * @param salt - Optional salt (generated if not provided)
 * @returns Complete payload ready for cloud storage
 */
export const prepareMasterKeyForCloud = async (
  masterKey: string,
  password: string,
  deviceId: string,
  salt?: string,
): Promise<CloudMasterKeyPayload> => {
  try {
    if (!masterKey || !password || !deviceId) {
      throw new Error('Master key, password, and deviceId are required');
    }

    // Generate salt if not provided
    const usedSalt = salt || uint8ArrayToBase64(crypto.getRandomValues(new Uint8Array(16)));

    if (masterKey && password && masterKey === password) {
      throw new Error('Master key and account password must not be identical');
    }

    // Generate cloud protection key
    const cloudProtectionKey = await generateCloudProtectionKey(password, usedSalt);

    // Encrypt master key
    const encryptedMasterKey = await encryptMasterKeyForCloud(
      masterKey,
      cloudProtectionKey,
      usedSalt,
    );

    // Create hash for verification
    const masterKeyHash = await hashMasterKey(masterKey);

    return {
      encryptedMasterKey,
      masterKeyHash,
      deviceId,
      metadata: {
        derivationAlgorithm: 'argon2id',
        derivationParams: {
          memory: 65536,
          iterations: 3,
          parallelism: 4,
        },
      },
    };
  } catch (error) {
    handleError(error, 'prepareMasterKeyForCloud');
    throw error;
  }
};

/**
 * Recovery: Decrypt master key from cloud
 * Used when on a new device or restoring from backup
 *
 * @param encryptedPayload - Retrieved encrypted master key from cloud
 * @param password - User password
 * @returns Decrypted master key or null if failed
 */
export const recoverMasterKeyFromCloud = async (
  encryptedPayload: CloudMasterKeyPayload['encryptedMasterKey'],
  password: string,
): Promise<string | null> => {
  try {
    if (!encryptedPayload || !password) {
      throw new Error('Encrypted payload and password are required');
    }

    // Regenerate cloud protection key using the stored salt
    const cloudProtectionKey = await generateCloudProtectionKey(password, encryptedPayload.salt);

    // Decrypt the master key
    const decryptedMasterKey = await decryptMasterKeyFromCloud(
      encryptedPayload,
      cloudProtectionKey,
    );

    if (!decryptedMasterKey) {
      throw new Error('Failed to decrypt master key from cloud');
    }

    return decryptedMasterKey;
  } catch (error) {
    handleError(error, 'recoverMasterKeyFromCloud');
    return null;
  }
};

/**
 * Verify that decrypted master key matches stored hash
 *
 * @param decryptedMasterKey - Decrypted master key (base64)
 * @param storedHash - Hash stored on server
 * @returns Boolean indicating if hashes match
 */
export const verifyDecryptedMasterKey = async (
  decryptedMasterKey: string,
  storedHash: string,
): Promise<boolean> => {
  try {
    if (!decryptedMasterKey || !storedHash) {
      return false;
    }

    const computedHash = await hashMasterKey(decryptedMasterKey);
    return computedHash === storedHash;
  } catch (error) {
    handleError(error, 'verifyDecryptedMasterKey');
    return false;
  }
};

export default {
  generateCloudProtectionKey,
  encryptMasterKeyForCloud,
  decryptMasterKeyFromCloud,
  hashMasterKey,
  prepareMasterKeyForCloud,
  recoverMasterKeyFromCloud,
  verifyDecryptedMasterKey,
};

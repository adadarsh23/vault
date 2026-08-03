import { getMasterKeyModel, MasterKeyDocument } from '../models/masterKey.ts';
import { User } from '../models/user.ts';
import { logger } from '../utils/logger.ts';
import { comparePassword, hashPassword, decryptText, encryptText } from '../utils/crypto.ts';

/**
 * Master Key Cloud Storage Service
 * Handles secure save/retrieve of encrypted master keys to/from MongoDB
 */

interface EncryptedMasterKeyPayload {
  cipherText: string;
  iv: string;
  authTag: string;
  salt?: string | null;
  algorithm?: string;
  keyVersion?: string;
}

interface MasterKeyMetadata {
  derivationAlgorithm?: string;
  derivationParams?: {
    memory?: number;
    iterations?: number;
    parallelism?: number;
  };
  deviceId?: string;
}

interface SaveMasterKeyOptions {
  masterKeyHash: string;
  deviceId: string;
  recoveryPhrasesEncrypted?: string;
  metadata?: MasterKeyMetadata;
  changeContext?: {
    ipAddress?: string;
    userAgent?: string;
  };
}

const MASTER_KEY_HASH_HISTORY_LIMIT = 20;

/**
 * Format encrypted master key data for display/logging
 * Shows the encrypted payload structure without exposing sensitive details
 */
const formatEncryptedMasterKeyForDisplay = (
  encryptedKey: EncryptedMasterKeyPayload
): Record<string, unknown> => {
  return {
    encryption: {
      algorithm: encryptedKey.algorithm || 'aes-256-gcm',
      keyVersion: encryptedKey.keyVersion || 'v1',
      components: {
        cipherTextLength: encryptedKey.cipherText.length,
        ivLength: encryptedKey.iv.length,
        authTagLength: encryptedKey.authTag.length,
        saltLength: encryptedKey.salt ? encryptedKey.salt.length : 0,
      },
    },
    security: {
      cipherTextPreview: `${encryptedKey.cipherText.substring(0, 20)}...${encryptedKey.cipherText.substring(encryptedKey.cipherText.length - 20)}`,
      ivPreview: `${encryptedKey.iv.substring(0, 12)}...`,
      authTagPreview: `${encryptedKey.authTag.substring(0, 12)}...`,
      saltPreview: encryptedKey.salt ? `${encryptedKey.salt.substring(0, 12)}...` : null,
    },
  };
};

/**
 * Save encrypted master key to cloud
 *
 * @param userId - User ID
 * @param encryptedKey - Master key encrypted with AES-256-GCM
 * @param options - Save options including hash and metadata
 * @returns Saved master key document
 */
export const saveCloudMasterKey = async (
  userId: string,
  username: string,
  encryptedKey: EncryptedMasterKeyPayload,
  options: SaveMasterKeyOptions
): Promise<MasterKeyDocument | null> => {
  try {
    logger.info(`[MasterKeyService] Saving encrypted master key for user: ${userId}`, {
      context: 'saveCloudMasterKey',
      userId,
      deviceId: options.deviceId,
    });

    if (!userId || !encryptedKey || !options.masterKeyHash) {
      throw new Error('Missing required parameters: userId, encryptedKey, or masterKeyHash');
    }

    if (
      !encryptedKey.cipherText ||
      !encryptedKey.iv ||
      !encryptedKey.authTag ||
      !encryptedKey.salt
    ) {
      throw new Error('Incomplete encrypted key payload');
    }

    const now = new Date();
    const MasterKey = getMasterKeyModel(username);
    const existing = await MasterKey.findOne({ userId, isDeleted: false })
      .select({ masterKeyHash: 1, metadata: 1 })
      .lean()
      .exec();

    const encryptedIncomingHash = encryptText(await hashPassword(options.masterKeyHash));

    const baseSet: Record<string, unknown> = {
      encryptedMasterKey: {
        cipherText: encryptedKey.cipherText,
        iv: encryptedKey.iv,
        authTag: encryptedKey.authTag,
        salt: encryptedKey.salt,
        algorithm: encryptedKey.algorithm || 'aes-256-gcm',
        keyVersion: encryptedKey.keyVersion || 'v1',
      },
      masterKeyHash: encryptedIncomingHash,
      'metadata.derivationAlgorithm': options.metadata?.derivationAlgorithm || 'argon2id',
      'metadata.derivationParams.memory': options.metadata?.derivationParams?.memory || 65536,
      'metadata.derivationParams.iterations': options.metadata?.derivationParams?.iterations || 3,
      'metadata.derivationParams.parallelism': options.metadata?.derivationParams?.parallelism || 4,
      'metadata.updatedAt': now,
      'metadata.lastAccessedAt': now,
      'metadata.deviceId': options.deviceId,
      isActive: true,
      isDeleted: false,
      deletedAt: null,
    };

    if (options.recoveryPhrasesEncrypted) {
      baseSet.recoveryPhrasesEncrypted = options.recoveryPhrasesEncrypted;
    }

    // Log the encrypted master key structure for verification
    logger.debug(`[MasterKeyService] Encrypted master key data structure for user: ${userId}`, {
      context: 'saveCloudMasterKey',
      encryptedKeyDisplay: formatEncryptedMasterKeyForDisplay(encryptedKey),
      derivationParams: options.metadata?.derivationParams,
    });

    const update: Record<string, unknown> = {
      $set: baseSet,
      $setOnInsert: {
        userId,
        'metadata.createdAt': now,
        'audit.accessCount': 0,
        'audit.failedDecryptionAttempts': 0,
        'audit.lastAccessedByDeviceId': options.deviceId,
      },
    };

    if (existing?.masterKeyHash) {
      const existingHash = decryptText(existing.masterKeyHash as any);
      const sameHash = await comparePassword(options.masterKeyHash, existingHash);

      if (!sameHash) {
        update.$push = {
          masterKeyHashHistory: {
            $each: [
              {
                hash: existing.masterKeyHash,
                changedAt: now,
                changedByDeviceId: options.deviceId || null,
                changedByIp: options.changeContext?.ipAddress || null,
                changedByUserAgent: options.changeContext?.userAgent || null,
              },
            ],
            $slice: -MASTER_KEY_HASH_HISTORY_LIMIT,
          },
        };
      }
    }

    const savedKey = await MasterKey.findOneAndUpdate({ userId, isDeleted: false }, update as any, {
      upsert: true,
      returnDocument: 'after',
      runValidators: true,
    });

    if (savedKey) {
      // Keep the canonical User document in sync so model hooks can archive
      // master-key history in users.history.masterKey.
      const userDoc = await User.findById(userId).select(
        '+masterKey +meta.masterKey +meta.masterKeyHash'
      );
      if (userDoc) {
        userDoc.masterKey = {
          cipherText: encryptedKey.cipherText,
          iv: encryptedKey.iv,
          authTag: encryptedKey.authTag,
          salt: encryptedKey.salt,
          algorithm: encryptedKey.algorithm || 'aes-256-gcm',
          keyVersion: encryptedKey.keyVersion || 'v1',
        } as any;

        if (!userDoc.meta) {
          (userDoc as any).meta = {};
        }
        (userDoc.meta as any).masterKey = userDoc.masterKey as any;
        (userDoc.meta as any).masterKeyHash = encryptedIncomingHash as any;
        (userDoc.meta as any).lastCredentialChangeAt = now;

        await userDoc.save();
      }

      logger.info(`[MasterKeyService] Master key saved successfully for user: ${userId}`, {
        context: 'saveCloudMasterKey',
        userId,
        documentId: savedKey._id.toString(),
        savedAt: now.toISOString(),
        encryptionAlgorithm: encryptedKey.algorithm || 'aes-256-gcm',
      });
    }

    return savedKey;
  } catch (error) {
    logger.error(`[MasterKeyService] Error saving master key for user: ${userId}`, error, {
      context: 'saveCloudMasterKey',
      userId,
    });
    throw error;
  }
};

/**
 * Retrieve encrypted master key from cloud
 *
 * @param userId - User ID
 * @param deviceId - Device ID accessing the key
 * @returns Encrypted master key payload or null if not found
 */
export const getCloudMasterKey = async (
  userId: string,
  username: string,
  deviceId: string
): Promise<EncryptedMasterKeyPayload | null> => {
  try {
    logger.info(`[MasterKeyService] Retrieving encrypted master key for user: ${userId}`, {
      context: 'getCloudMasterKey',
      userId,
      deviceId,
    });

    if (!userId) {
      throw new Error('Missing userId');
    }

    const MasterKey = getMasterKeyModel(username);
    const masterKeyDoc = await MasterKey.findOne(
      { userId, isActive: true, isDeleted: false },
      {
        encryptedMasterKey: 1,
        masterKeyHash: 1,
        'metadata.derivationParams': 1,
        'audit.accessCount': 1,
      }
    );

    if (!masterKeyDoc) {
      logger.warn(`[MasterKeyService] Master key not found for user: ${userId}`, {
        context: 'getCloudMasterKey',
        userId,
      });
      return null;
    }

    // Update access tracking
    await MasterKey.findByIdAndUpdate(masterKeyDoc._id, {
      'metadata.lastAccessedAt': new Date(),
      'audit.accessCount': ((masterKeyDoc.audit as any)?.accessCount || 0) + 1,
      'audit.lastAccessedByDeviceId': deviceId,
    });

    logger.info(`[MasterKeyService] Master key retrieved successfully for user: ${userId}`, {
      context: 'getCloudMasterKey',
      userId,
      accessCount: ((masterKeyDoc.audit as any)?.accessCount || 0) + 1,
    });

    return masterKeyDoc.encryptedMasterKey;
  } catch (error) {
    logger.error(`[MasterKeyService] Error retrieving master key for user: ${userId}`, error, {
      context: 'getCloudMasterKey',
      userId,
    });
    throw error;
  }
};

/**
 * Verify master key hash (without exposing actual key)
 * Used by clients to verify they have the correct decrypted master key
 *
 * @param userId - User ID
 * @param masterKeyHash - Hash to verify
 * @returns Boolean indicating if hash matches
 */
export const verifyMasterKeyHash = async (
  userId: string,
  username: string,
  masterKeyHash: string
): Promise<boolean> => {
  try {
    logger.debug(`[MasterKeyService] Verifying master key hash for user: ${userId}`, {
      context: 'verifyMasterKeyHash',
      userId,
    });

    if (!userId || !masterKeyHash) {
      return false;
    }

    const MasterKey = getMasterKeyModel(username);
    const masterKeyDoc = await MasterKey.findOne(
      { userId, isActive: true, isDeleted: false },
      { masterKeyHash: 1 }
    );

    if (!masterKeyDoc) {
      return false;
    }

    const storedHash = decryptText(masterKeyDoc.masterKeyHash as any);
    const isValid = await comparePassword(masterKeyHash, storedHash);

    if (!isValid) {
      // Track failed verification attempt
      await MasterKey.findByIdAndUpdate(masterKeyDoc._id, {
        'audit.failedDecryptionAttempts':
          ((masterKeyDoc.audit as any)?.failedDecryptionAttempts || 0) + 1,
        'audit.lastFailedAttempt': new Date(),
      });

      logger.warn(`[MasterKeyService] Master key hash verification failed for user: ${userId}`, {
        context: 'verifyMasterKeyHash',
        userId,
      });
    }

    return isValid;
  } catch (error) {
    logger.error(`[MasterKeyService] Error verifying master key hash for user: ${userId}`, error, {
      context: 'verifyMasterKeyHash',
      userId,
    });
    return false;
  }
};

/**
 * Delete master key from cloud (soft delete)
 *
 * @param userId - User ID
 * @returns Boolean indicating success
 */
export const deleteCloudMasterKey = async (userId: string, username: string): Promise<boolean> => {
  try {
    logger.warn(`[MasterKeyService] Deleting master key for user: ${userId}`, {
      context: 'deleteCloudMasterKey',
      userId,
    });

    if (!userId) {
      throw new Error('Missing userId');
    }

    const MasterKey = getMasterKeyModel(username);
    const result = await MasterKey.findOneAndUpdate(
      { userId, isDeleted: false },
      {
        isActive: false,
        isDeleted: true,
        deletedAt: new Date(),
      }
    );

    const success = !!result;

    logger.info(
      success
        ? `[MasterKeyService] Master key deleted for user: ${userId}`
        : `[MasterKeyService] Master key not found for deletion: ${userId}`,
      {
        context: 'deleteCloudMasterKey',
        userId,
      }
    );

    return success;
  } catch (error) {
    logger.error(`[MasterKeyService] Error deleting master key for user: ${userId}`, error, {
      context: 'deleteCloudMasterKey',
      userId,
    });
    throw error;
  }
};

/**
 * Get master key metadata (for debugging/auditing)
 *
 * @param userId - User ID
 * @returns Master key metadata or null
 */
export const getMasterKeyMetadata = async (
  userId: string,
  username: string
): Promise<{ metadata: any; audit: any; historyCount: number } | null> => {
  try {
    const MasterKey = getMasterKeyModel(username);
    const masterKeyDoc = await MasterKey.findOne(
      { userId, isActive: true, isDeleted: false },
      { metadata: 1, audit: 1, masterKeyHashHistory: 1 }
    );

    if (!masterKeyDoc) {
      return null;
    }

    return {
      metadata: masterKeyDoc.metadata,
      audit: masterKeyDoc.audit,
      historyCount: Array.isArray((masterKeyDoc as any).masterKeyHashHistory)
        ? (masterKeyDoc as any).masterKeyHashHistory.length
        : 0,
    };
  } catch (error) {
    logger.error(
      `[MasterKeyService] Error getting master key metadata for user: ${userId}`,
      error,
      {
        context: 'getMasterKeyMetadata',
        userId,
      }
    );
    return null;
  }
};

/**
 * Get full master key data for display (encrypted components and metadata)
 * Used for verification and debugging
 *
 * @param userId - User ID
 * @returns Full master key document with all data or null
 */
export const getMasterKeyFullData = async (
  userId: string,
  username: string
): Promise<{
  encryptedMasterKey: Record<string, unknown>;
  masterKeyHash: string;
  metadata: any;
  audit: any;
  historyCount: number;
  createdAt: Date;
  updatedAt: Date;
} | null> => {
  try {
    logger.info(`[MasterKeyService] Retrieving full master key data for user: ${userId}`, {
      context: 'getMasterKeyFullData',
      userId,
    });

    const MasterKey = getMasterKeyModel(username);
    const masterKeyDoc = await MasterKey.findOne(
      { userId, isActive: true, isDeleted: false },
      {
        encryptedMasterKey: 1,
        masterKeyHash: 1,
        metadata: 1,
        audit: 1,
        masterKeyHashHistory: 1,
        createdAt: 1,
        updatedAt: 1,
      }
    );

    if (!masterKeyDoc) {
      logger.warn(`[MasterKeyService] Master key data not found for user: ${userId}`, {
        context: 'getMasterKeyFullData',
        userId,
      });
      return null;
    }

    const displayData = {
      encryptedMasterKey: formatEncryptedMasterKeyForDisplay(
        masterKeyDoc.encryptedMasterKey as EncryptedMasterKeyPayload
      ),
      masterKeyHashPreview: `${(masterKeyDoc.masterKeyHash as any).cipherText.substring(0, 20)}...`,
      metadata: masterKeyDoc.metadata,
      audit: masterKeyDoc.audit,
      historyCount: Array.isArray((masterKeyDoc as any).masterKeyHashHistory)
        ? (masterKeyDoc as any).masterKeyHashHistory.length
        : 0,
      createdAt: masterKeyDoc.createdAt,
      updatedAt: masterKeyDoc.updatedAt,
    };

    logger.debug(`[MasterKeyService] Full master key data retrieved for user: ${userId}`, {
      context: 'getMasterKeyFullData',
      userId,
      displayData,
    });

    return displayData as any;
  } catch (error) {
    logger.error(
      `[MasterKeyService] Error getting full master key data for user: ${userId}`,
      error,
      {
        context: 'getMasterKeyFullData',
        userId,
      }
    );
    return null;
  }
};

export default {
  saveCloudMasterKey,
  getCloudMasterKey,
  verifyMasterKeyHash,
  deleteCloudMasterKey,
  getMasterKeyMetadata,
  getMasterKeyFullData,
};

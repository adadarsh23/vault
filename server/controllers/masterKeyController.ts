import express from 'express';
import {
  saveCloudMasterKey,
  getCloudMasterKey,
  verifyMasterKeyHash,
  deleteCloudMasterKey,
  getMasterKeyMetadata,
  getMasterKeyFullData,
} from '../services/masterKeyService.ts';
import { logger } from '../utils/logger.ts';
import { getClientIp } from '../utils/requestIp.ts';
import { User } from '../models/user.ts';
import { comparePassword, decryptText } from '../utils/crypto.ts';
import { AppError } from '../utils/appError.ts';

/**
 * Master Key Controller
 * Handles API endpoints for cloud master key storage and retrieval
 */

const handleControllerError = (
  res: express.Response,
  error: unknown,
  defaultCode: string,
  defaultMessage: string,
  logContext: string
) => {
  logger.error(`[MasterKeyController] Error in ${logContext}`, error);

  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      success: false,
      error: {
        code: error.code,
        message: error.message,
      },
    });
  }

  const statusCode =
    typeof (error as any)?.statusCode === 'number'
      ? (error as any).statusCode
      : typeof (error as any)?.status === 'number'
        ? (error as any).status
        : 500;

  const code = typeof (error as any)?.code === 'string' ? (error as any).code : defaultCode;
  const message = error instanceof Error ? error.message : defaultMessage;

  return res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
    },
  });
};

interface SaveMasterKeyRequest {
  encryptedMasterKey: {
    cipherText: string;
    iv: string;
    authTag: string;
    salt: string;
    algorithm?: string;
    keyVersion?: string;
  };
  masterKeyHash: string;
  deviceId: string;
  recoveryPhrasesEncrypted?: string;
  metadata?: {
    derivationAlgorithm?: string;
    derivationParams?: {
      memory?: number;
      iterations?: number;
      parallelism?: number;
    };
  };
}

interface VerifyMasterKeyRequest {
  masterKeyHash: string;
}

const MAX_BASE64_FIELD_LENGTH = 8192;
const MAX_MASTER_KEY_HASH_LENGTH = 256;
const MAX_DEVICE_ID_LENGTH = 128;
const MAX_RECOVERY_PAYLOAD_LENGTH = 32768;
const BASE64_PATTERN = /^[A-Za-z0-9+/=]+$/;

const isBase64WithinLimit = (value: unknown, maxLength: number): value is string => {
  if (typeof value !== 'string') {
    return false;
  }

  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maxLength) {
    return false;
  }

  return BASE64_PATTERN.test(normalized);
};

const isValidDeviceId = (value: unknown): value is string => {
  if (typeof value !== 'string') {
    return false;
  }

  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > MAX_DEVICE_ID_LENGTH) {
    return false;
  }

  return /^[a-zA-Z0-9._:-]+$/.test(normalized);
};

const hasValidDerivationParams = (metadata: SaveMasterKeyRequest['metadata']) => {
  if (!metadata?.derivationParams) {
    return true;
  }

  const { memory, iterations, parallelism } = metadata.derivationParams;
  const isValidMemory =
    memory === undefined || (Number.isInteger(memory) && memory >= 8192 && memory <= 1048576);
  const isValidIterations =
    iterations === undefined ||
    (Number.isInteger(iterations) && iterations >= 1 && iterations <= 12);
  const isValidParallelism =
    parallelism === undefined ||
    (Number.isInteger(parallelism) && parallelism >= 1 && parallelism <= 32);

  return isValidMemory && isValidIterations && isValidParallelism;
};

/**
 * POST /api/master-key/save
 * Save encrypted master key to cloud
 */
export const handleSaveMasterKey = async (
  req: express.Request<{}, {}, SaveMasterKeyRequest>,
  res: express.Response
) => {
  try {
    const userId = (req as any).user?.userId;
    const username = (req as any).user?.username;
    const { encryptedMasterKey, masterKeyHash, deviceId, recoveryPhrasesEncrypted, metadata } =
      req.body;

    if (!userId || !username) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
    }

    // Validate required fields
    if (!encryptedMasterKey || !masterKeyHash || !deviceId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Missing required fields: encryptedMasterKey, masterKeyHash, or deviceId',
        },
      });
    }

    // Validate encrypted master key structure
    if (
      !encryptedMasterKey.cipherText ||
      !encryptedMasterKey.iv ||
      !encryptedMasterKey.authTag ||
      !encryptedMasterKey.salt
    ) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Incomplete encrypted key payload',
        },
      });
    }

    if (!isValidDeviceId(deviceId)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Invalid deviceId format or length',
        },
      });
    }

    if (!isBase64WithinLimit(masterKeyHash, MAX_MASTER_KEY_HASH_LENGTH)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Invalid masterKeyHash format or length',
        },
      });
    }

    if (
      !isBase64WithinLimit(encryptedMasterKey.cipherText, MAX_BASE64_FIELD_LENGTH) ||
      !isBase64WithinLimit(encryptedMasterKey.iv, MAX_BASE64_FIELD_LENGTH) ||
      !isBase64WithinLimit(encryptedMasterKey.authTag, MAX_BASE64_FIELD_LENGTH) ||
      !isBase64WithinLimit(encryptedMasterKey.salt, MAX_BASE64_FIELD_LENGTH)
    ) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Encrypted master key payload is malformed or too large',
        },
      });
    }

    if (
      typeof recoveryPhrasesEncrypted === 'string' &&
      recoveryPhrasesEncrypted.length > MAX_RECOVERY_PAYLOAD_LENGTH
    ) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Recovery payload is too large',
        },
      });
    }

    if (!hasValidDerivationParams(metadata)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Invalid metadata derivation parameters',
        },
      });
    }

    const userDoc = await User.findById(userId).select('+password').lean().exec();
    if (userDoc?.password) {
      try {
        const passwordHash =
          typeof userDoc.password === 'string'
            ? userDoc.password
            : decryptText(userDoc.password as any);

        const currentAccountPassword =
          typeof (req.body as any).password === 'string' && (req.body as any).password.trim()
            ? (req.body as any).password.trim()
            : undefined;

        if (currentAccountPassword) {
          const isPasswordValid = await comparePassword(currentAccountPassword, passwordHash);
          if (!isPasswordValid) {
            return res.status(401).json({
              success: false,
              error: {
                code: 'INVALID_CREDENTIALS',
                message: 'Current password is incorrect',
              },
            });
          }
        }

        const rawKeyCandidate =
          typeof (req.body as any).masterKey === 'string' ? (req.body as any).masterKey : undefined;
        if (rawKeyCandidate) {
          const isSameAsPassword = await comparePassword(rawKeyCandidate, passwordHash);
          if (isSameAsPassword) {
            return res.status(400).json({
              success: false,
              error: {
                code: 'AUTH_SAME_CREDENTIALS',
                message: 'Master key and account password must not be identical',
              },
            });
          }
        }
      } catch (error) {
        if ((error as any)?.statusCode || (error as any)?.code) {
          throw error;
        }
      }
    }

    await saveCloudMasterKey(userId, username, encryptedMasterKey, {
      masterKeyHash,
      deviceId,
      recoveryPhrasesEncrypted,
      metadata,
      changeContext: {
        ipAddress: getClientIp(req),
        userAgent: req.get('user-agent') || undefined,
      },
    });

    res.status(200).json({
      success: true,
      data: {
        saved: true,
        userId,
        deviceId,
        timestamp: new Date().toISOString(),
        message: 'Master key saved to cloud successfully',
      },
    });
  } catch (error) {
    return handleControllerError(
      res,
      error,
      'SAVE_FAILED',
      'Failed to save master key',
      'handleSaveMasterKey'
    );
  }
};

/**
 * GET /api/master-key/retrieve
 * Retrieve encrypted master key from cloud
 */
export const handleRetrieveMasterKey = async (req: express.Request, res: express.Response) => {
  try {
    const userId = (req as any).user?.userId;
    const username = (req as any).user?.username;
    const deviceId = req.query.deviceId as string;

    if (!userId || !username) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
    }

    if (!deviceId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Missing required query parameter: deviceId',
        },
      });
    }

    if (!isValidDeviceId(deviceId)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Invalid deviceId format or length',
        },
      });
    }

    const encryptedKey = await getCloudMasterKey(userId, username, deviceId);

    if (!encryptedKey) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Master key not found in cloud',
        },
      });
    }

    res.status(200).json({
      success: true,
      data: {
        encryptedMasterKey: encryptedKey,
        userId,
        timestamp: new Date().toISOString(),
        message: 'Master key retrieved successfully',
      },
    });
  } catch (error) {
    return handleControllerError(
      res,
      error,
      'RETRIEVE_FAILED',
      'Failed to retrieve master key',
      'handleRetrieveMasterKey'
    );
  }
};

/**
 * POST /api/master-key/verify
 * Verify master key hash (check if correct key was decrypted)
 */
export const handleVerifyMasterKey = async (
  req: express.Request<{}, {}, VerifyMasterKeyRequest>,
  res: express.Response
) => {
  try {
    const userId = (req as any).user?.userId;
    const username = (req as any).user?.username;
    const { masterKeyHash } = req.body;

    if (!userId || !username) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
    }

    if (!masterKeyHash) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Missing required field: masterKeyHash',
        },
      });
    }

    if (!isBase64WithinLimit(masterKeyHash, MAX_MASTER_KEY_HASH_LENGTH)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Invalid masterKeyHash format or length',
        },
      });
    }

    const isValid = await verifyMasterKeyHash(userId, username, masterKeyHash);

    res.status(200).json({
      success: true,
      data: {
        isValid,
        userId,
        timestamp: new Date().toISOString(),
        message: isValid ? 'Master key verified successfully' : 'Master key hash mismatch',
      },
    });
  } catch (error) {
    return handleControllerError(
      res,
      error,
      'VERIFY_FAILED',
      'Failed to verify master key',
      'handleVerifyMasterKey'
    );
  }
};

/**
 * DELETE /api/master-key
 * Delete master key from cloud
 */
export const handleDeleteMasterKey = async (req: express.Request, res: express.Response) => {
  try {
    const userId = (req as any).user?.userId;
    const username = (req as any).user?.username;

    if (!userId || !username) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
    }

    const deleted = await deleteCloudMasterKey(userId, username);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Master key not found or already deleted',
        },
      });
    }

    res.status(200).json({
      success: true,
      data: {
        deleted: true,
        userId,
        timestamp: new Date().toISOString(),
        message: 'Master key deleted successfully',
      },
    });
  } catch (error) {
    return handleControllerError(
      res,
      error,
      'DELETE_FAILED',
      'Failed to delete master key',
      'handleDeleteMasterKey'
    );
  }
};

/**
 * GET /api/master-key/metadata
 * Get master key metadata (for debugging/auditing)
 */
export const handleGetMasterKeyMetadata = async (req: express.Request, res: express.Response) => {
  try {
    const userId = (req as any).user?.userId;
    const username = (req as any).user?.username;

    if (!userId || !username) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
    }

    const metadata = await getMasterKeyMetadata(userId, username);

    if (!metadata) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Master key metadata not found',
        },
      });
    }

    res.status(200).json({
      success: true,
      data: {
        metadata: metadata.metadata,
        audit: metadata.audit,
        userId,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    return handleControllerError(
      res,
      error,
      'GET_METADATA_FAILED',
      'Failed to get metadata',
      'handleGetMasterKeyMetadata'
    );
  }
};

/**
 * GET /api/master-key/full-data
 * Get complete master key data including encrypted components and metadata
 * (For verification and debugging only)
 */
export const handleGetMasterKeyFullData = async (req: express.Request, res: express.Response) => {
  try {
    const userId = (req as any).user?.userId;
    const username = (req as any).user?.username;

    if (!userId || !username) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
    }

    const fullData = await getMasterKeyFullData(userId, username);

    if (!fullData) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Master key data not found',
        },
      });
    }

    res.status(200).json({
      success: true,
      data: {
        userId,
        masterKey: fullData,
        timestamp: new Date().toISOString(),
        note: 'Encrypted data is safe - only encrypted components and hashes are shown, actual key material remains encrypted',
      },
    });
  } catch (error) {
    return handleControllerError(
      res,
      error,
      'GET_FULLDATA_FAILED',
      'Failed to get full data',
      'handleGetMasterKeyFullData'
    );
  }
};

export default {
  handleSaveMasterKey,
  handleRetrieveMasterKey,
  handleVerifyMasterKey,
  handleDeleteMasterKey,
  handleGetMasterKeyMetadata,
  handleGetMasterKeyFullData,
};

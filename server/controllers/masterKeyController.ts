import express from 'express';
import mongoose from 'mongoose';
import {
  saveCloudMasterKey,
  getCloudMasterKey,
  verifyMasterKeyHash,
  deleteCloudMasterKey,
  getMasterKeyMetadata,
  getMasterKeyFullData,
} from '../services/masterKeyService.ts';
import { getClientIp } from '../utils/requestIp.ts';
import { User } from '../models/user.ts';
import { comparePassword, decryptText } from '../utils/crypto.ts';
import { AppError } from '../utils/appError.ts';
import { sendSuccess } from '../responses.ts';

const MAX_BASE64_FIELD_LENGTH = 8192;
const MAX_MASTER_KEY_HASH_LENGTH = 256;
const MAX_DEVICE_ID_LENGTH = 128;
const MAX_RECOVERY_PAYLOAD_LENGTH = 32768;
const BASE64_PATTERN = /^[A-Za-z0-9+/=]+$/;

const isBase64WithinLimit = (value: unknown, maxLength: number): value is string => {
  if (typeof value !== 'string') return false;
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maxLength) return false;
  return BASE64_PATTERN.test(normalized);
};

const isValidDeviceId = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > MAX_DEVICE_ID_LENGTH) return false;
  return /^[a-zA-Z0-9._:-]+$/.test(normalized);
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
  password?: string;
  masterKey?: string;
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

const hasValidDerivationParams = (metadata: SaveMasterKeyRequest['metadata']) => {
  if (!metadata?.derivationParams) return true;
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

const writeMasterKeyHeaders = (res: express.Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
};

/**
 * POST /api/master-key/save
 * Save encrypted master key to cloud
 */
export const handleSaveMasterKey = async (
  req: express.Request<{}, {}, SaveMasterKeyRequest>,
  res: express.Response,
) => {
  writeMasterKeyHeaders(res);

  const userId = (req as any).user?.userId;
  const username = (req as any).user?.username;

  if (!userId || !username) {
    throw AppError.unauthorized('Authentication required', 'UNAUTHORIZED');
  }

  const { encryptedMasterKey, masterKeyHash, deviceId, recoveryPhrasesEncrypted, metadata } =
    req.body || {};

  if (!encryptedMasterKey || !masterKeyHash || !deviceId) {
    throw AppError.badRequest(
      'Missing required fields: encryptedMasterKey, masterKeyHash, or deviceId',
      'INVALID_REQUEST',
    );
  }

  if (
    !encryptedMasterKey.cipherText ||
    !encryptedMasterKey.iv ||
    !encryptedMasterKey.authTag ||
    !encryptedMasterKey.salt
  ) {
    throw AppError.badRequest('Incomplete encrypted key payload', 'INVALID_REQUEST');
  }

  if (!isValidDeviceId(deviceId)) {
    throw AppError.badRequest('Invalid deviceId format or length', 'INVALID_REQUEST');
  }

  if (!isBase64WithinLimit(masterKeyHash, MAX_MASTER_KEY_HASH_LENGTH)) {
    throw AppError.badRequest('Invalid masterKeyHash format or length', 'INVALID_REQUEST');
  }

  if (
    !isBase64WithinLimit(encryptedMasterKey.cipherText, MAX_BASE64_FIELD_LENGTH) ||
    !isBase64WithinLimit(encryptedMasterKey.iv, MAX_BASE64_FIELD_LENGTH) ||
    !isBase64WithinLimit(encryptedMasterKey.authTag, MAX_BASE64_FIELD_LENGTH) ||
    !isBase64WithinLimit(encryptedMasterKey.salt, MAX_BASE64_FIELD_LENGTH)
  ) {
    throw AppError.badRequest(
      'Encrypted master key payload is malformed or too large',
      'INVALID_REQUEST',
    );
  }

  if (
    typeof recoveryPhrasesEncrypted === 'string' &&
    recoveryPhrasesEncrypted.length > MAX_RECOVERY_PAYLOAD_LENGTH
  ) {
    throw AppError.badRequest('Recovery payload is too large', 'INVALID_REQUEST');
  }

  if (!hasValidDerivationParams(metadata)) {
    throw AppError.badRequest('Invalid metadata derivation parameters', 'INVALID_REQUEST');
  }

  if (mongoose.Types.ObjectId.isValid(userId)) {
    const userDoc = await User.findById(userId).select('+password +meta.masterKey').lean().exec();
    if (userDoc?.password) {
      const passwordHash =
        typeof userDoc.password === 'string'
          ? userDoc.password
          : decryptText(userDoc.password as any);

      const currentAccountPassword =
        typeof req.body?.password === 'string' && req.body.password.trim()
          ? req.body.password.trim()
          : undefined;

      const hasExistingMasterKey = Boolean((userDoc as any).meta?.masterKey?.cipherText);
      if (hasExistingMasterKey && !currentAccountPassword) {
        throw AppError.badRequest(
          'Current account password is required to update the cloud master key.',
          'PASSWORD_REQUIRED',
        );
      }

      if (currentAccountPassword) {
        const isPasswordValid = await comparePassword(currentAccountPassword, passwordHash);
        if (!isPasswordValid) {
          throw AppError.unauthorized('Current password is incorrect.', 'INVALID_CREDENTIALS');
        }
      }

      const rawKeyCandidate =
        typeof req.body?.masterKey === 'string' ? req.body.masterKey : undefined;
      if (rawKeyCandidate) {
        const isSameAsPassword = await comparePassword(rawKeyCandidate, passwordHash);
        if (isSameAsPassword) {
          throw AppError.badRequest(
            'Master key and account password must not be identical',
            'AUTH_SAME_CREDENTIALS',
          );
        }
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

  return sendSuccess(
    res,
    {
      saved: true,
      userId,
      deviceId,
      timestamp: new Date().toISOString(),
      message: 'Master key saved to cloud successfully',
    },
    'Master key saved to cloud successfully',
  );
};

/**
 * GET /api/master-key/retrieve
 * Retrieve encrypted master key from cloud
 */
export const handleRetrieveMasterKey = async (req: express.Request, res: express.Response) => {
  writeMasterKeyHeaders(res);

  const userId = (req as any).user?.userId;
  const username = (req as any).user?.username;
  const deviceId = req.query.deviceId as string;

  if (!userId || !username) {
    throw AppError.unauthorized('Authentication required', 'UNAUTHORIZED');
  }

  if (!deviceId) {
    throw AppError.badRequest('Missing required query parameter: deviceId', 'INVALID_REQUEST');
  }

  if (!isValidDeviceId(deviceId)) {
    throw AppError.badRequest('Invalid deviceId format or length', 'INVALID_REQUEST');
  }

  const encryptedKey = await getCloudMasterKey(userId, username, deviceId);

  if (!encryptedKey) {
    throw AppError.notFound('Master key not found in cloud', 'NOT_FOUND');
  }

  return sendSuccess(
    res,
    {
      encryptedMasterKey: encryptedKey,
      userId,
      timestamp: new Date().toISOString(),
      message: 'Master key retrieved successfully',
    },
    'Master key retrieved successfully',
  );
};

/**
 * POST /api/master-key/verify
 * Verify master key hash (check if correct key was decrypted)
 */
export const handleVerifyMasterKey = async (
  req: express.Request<{}, {}, VerifyMasterKeyRequest>,
  res: express.Response,
) => {
  writeMasterKeyHeaders(res);

  const userId = (req as any).user?.userId;
  const username = (req as any).user?.username;
  const { masterKeyHash } = req.body || {};

  if (!userId || !username) {
    throw AppError.unauthorized('Authentication required', 'UNAUTHORIZED');
  }

  if (!masterKeyHash) {
    throw AppError.badRequest('Missing required field: masterKeyHash', 'INVALID_REQUEST');
  }

  if (!isBase64WithinLimit(masterKeyHash, MAX_MASTER_KEY_HASH_LENGTH)) {
    throw AppError.badRequest('Invalid masterKeyHash format or length', 'INVALID_REQUEST');
  }

  const isValid = await verifyMasterKeyHash(userId, username, masterKeyHash);

  return sendSuccess(
    res,
    {
      isValid,
      userId,
      timestamp: new Date().toISOString(),
      message: isValid ? 'Master key verified successfully' : 'Master key hash mismatch',
    },
    isValid ? 'Master key verified successfully' : 'Master key hash mismatch',
  );
};

/**
 * DELETE /api/master-key
 * Delete master key from cloud
 */
export const handleDeleteMasterKey = async (req: express.Request, res: express.Response) => {
  writeMasterKeyHeaders(res);

  const userId = (req as any).user?.userId;
  const username = (req as any).user?.username;

  if (!userId || !username) {
    throw AppError.unauthorized('Authentication required', 'UNAUTHORIZED');
  }

  const deleted = await deleteCloudMasterKey(userId, username);

  if (!deleted) {
    throw AppError.notFound('Master key not found or already deleted', 'NOT_FOUND');
  }

  return sendSuccess(
    res,
    {
      deleted: true,
      userId,
      timestamp: new Date().toISOString(),
      message: 'Master key deleted successfully',
    },
    'Master key deleted successfully',
  );
};

/**
 * GET /api/master-key/metadata
 * Get master key metadata (for debugging/auditing)
 */
export const handleGetMasterKeyMetadata = async (req: express.Request, res: express.Response) => {
  writeMasterKeyHeaders(res);

  const userId = (req as any).user?.userId;
  const username = (req as any).user?.username;

  if (!userId || !username) {
    throw AppError.unauthorized('Authentication required', 'UNAUTHORIZED');
  }

  const metadata = await getMasterKeyMetadata(userId, username);

  if (!metadata) {
    throw AppError.notFound('Master key metadata not found', 'NOT_FOUND');
  }

  return sendSuccess(
    res,
    {
      metadata: metadata.metadata,
      audit: metadata.audit,
      userId,
      timestamp: new Date().toISOString(),
    },
    'Master key metadata retrieved successfully',
  );
};

/**
 * GET /api/master-key/full-data
 * Get complete master key data including encrypted components and metadata
 */
export const handleGetMasterKeyFullData = async (req: express.Request, res: express.Response) => {
  writeMasterKeyHeaders(res);

  const userId = (req as any).user?.userId;
  const username = (req as any).user?.username;

  if (!userId || !username) {
    throw AppError.unauthorized('Authentication required', 'UNAUTHORIZED');
  }

  const fullData = await getMasterKeyFullData(userId, username);

  if (!fullData) {
    throw AppError.notFound('Master key data not found', 'NOT_FOUND');
  }

  return sendSuccess(
    res,
    {
      userId,
      masterKey: fullData,
      timestamp: new Date().toISOString(),
      note: 'Encrypted data is safe - only encrypted components and hashes are shown, actual key material remains encrypted',
    },
    'Master key full data retrieved successfully',
  );
};

export default {
  handleSaveMasterKey,
  handleRetrieveMasterKey,
  handleVerifyMasterKey,
  handleDeleteMasterKey,
  handleGetMasterKeyMetadata,
  handleGetMasterKeyFullData,
};

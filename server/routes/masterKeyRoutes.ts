import express from 'express'
import rateLimit from 'express-rate-limit'
import { requireAuth } from '../middleware/authMiddleware.ts'
import {
  handleSaveMasterKey,
  handleRetrieveMasterKey,
  handleVerifyMasterKey,
  handleDeleteMasterKey,
  handleGetMasterKeyMetadata,
  handleGetMasterKeyFullData,
} from '../controllers/masterKeyController.ts'
import { asyncHandler } from '../utils/asyncHandler.ts'
import { getClientIp } from '../utils/requestIp.ts'
import { requireTrustedBrowserOrigin } from '../middleware/csrfOriginMiddleware.ts'

export const masterKeyRouter = express.Router()

const toPositiveInteger = (raw: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(raw || '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const normalizeRateLimitSegment = (value: unknown): string => {
  if (typeof value !== 'string') {
    return 'unknown'
  }

  const normalized = value.trim().toLowerCase()
  return normalized.length > 0 ? normalized.slice(0, 128) : 'unknown'
}

const masterKeyRateLimitWindowMs = toPositiveInteger(
  process.env.MASTER_KEY_RATE_LIMIT_WINDOW_MS,
  15 * 60 * 1000,
)

const createMasterKeyLimiter = (
  max: number,
  message: string,
  code: string,
) =>
  rateLimit({
    windowMs: masterKeyRateLimitWindowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) =>
      `${getClientIp(req)}:${req.path}:${normalizeRateLimitSegment((req as any)?.user?.userId)}:${normalizeRateLimitSegment(req.query?.deviceId || req.body?.deviceId)}`,
    message: {
      success: false,
      message,
      error: { code },
    },
  })

const saveMasterKeyLimiter = createMasterKeyLimiter(
  toPositiveInteger(process.env.MASTER_KEY_SAVE_RATE_LIMIT_MAX, 10),
  'Too many master key save attempts. Please try again later.',
  'TOO_MANY_MASTER_KEY_SAVE_ATTEMPTS',
)
const retrieveMasterKeyLimiter = createMasterKeyLimiter(
  toPositiveInteger(process.env.MASTER_KEY_RETRIEVE_RATE_LIMIT_MAX, 40),
  'Too many master key retrieval attempts. Please try again later.',
  'TOO_MANY_MASTER_KEY_RETRIEVE_ATTEMPTS',
)
const verifyMasterKeyLimiter = createMasterKeyLimiter(
  toPositiveInteger(process.env.MASTER_KEY_VERIFY_RATE_LIMIT_MAX, 20),
  'Too many master key verification attempts. Please try again later.',
  'TOO_MANY_MASTER_KEY_VERIFY_ATTEMPTS',
)
const deleteMasterKeyLimiter = createMasterKeyLimiter(
  toPositiveInteger(process.env.MASTER_KEY_DELETE_RATE_LIMIT_MAX, 5),
  'Too many master key deletion attempts. Please try again later.',
  'TOO_MANY_MASTER_KEY_DELETE_ATTEMPTS',
)
const readMasterKeyAuditLimiter = createMasterKeyLimiter(
  toPositiveInteger(process.env.MASTER_KEY_AUDIT_RATE_LIMIT_MAX, 20),
  'Too many master key metadata requests. Please try again later.',
  'TOO_MANY_MASTER_KEY_AUDIT_ATTEMPTS',
)

/**
 * Master Key Cloud Storage Routes
 *
 * These endpoints handle secure storage and retrieval of encrypted master keys
 * All endpoints require authentication
 */

/**
 * POST /api/master-key/save
 * Save encrypted master key to cloud
 *
 * Request body:
 * {
 *   encryptedMasterKey: {
 *     cipherText: string,
 *     iv: string,
 *     authTag: string,
 *     salt: string,
 *     algorithm?: string,
 *     keyVersion?: string
 *   },
 *   masterKeyHash: string,
 *   deviceId: string,
 *   recoveryPhrasesEncrypted?: string,
 *   metadata?: {
 *     derivationAlgorithm?: string,
 *     derivationParams?: {
 *       memory?: number,
 *       iterations?: number,
 *       parallelism?: number
 *     }
 *   }
 * }
 */
masterKeyRouter.post(
  '/save',
  requireTrustedBrowserOrigin,
  requireAuth,
  saveMasterKeyLimiter,
  asyncHandler(handleSaveMasterKey),
)

/**
 * GET /api/master-key/retrieve?deviceId=<deviceId>
 * Retrieve encrypted master key from cloud
 *
 * Query parameters:
 * - deviceId: string (required) - Device requesting the key
 *
 * Response:
 * {
 *   success: true,
 *   data: {
 *     encryptedMasterKey: {
 *       cipherText: string,
 *       iv: string,
 *       authTag: string,
 *       salt: string,
 *       algorithm: string,
 *       keyVersion: string
 *     },
 *     userId: string,
 *     timestamp: string
 *   }
 * }
 */
masterKeyRouter.get(
  '/retrieve',
  requireAuth,
  retrieveMasterKeyLimiter,
  asyncHandler(handleRetrieveMasterKey),
)

/**
 * POST /api/master-key/verify
 * Verify master key hash (without exposing the key itself)
 *
 * Request body:
 * {
 *   masterKeyHash: string - SHA-256 hash of decrypted master key
 * }
 *
 * Response:
 * {
 *   success: true,
 *   data: {
 *     isValid: boolean,
 *     message: string
 *   }
 * }
 */
masterKeyRouter.post(
  '/verify',
  requireTrustedBrowserOrigin,
  requireAuth,
  verifyMasterKeyLimiter,
  asyncHandler(handleVerifyMasterKey),
)

/**
 * DELETE /api/master-key
 * Delete master key from cloud (soft delete)
 */
masterKeyRouter.delete(
  '/',
  requireTrustedBrowserOrigin,
  requireAuth,
  deleteMasterKeyLimiter,
  asyncHandler(handleDeleteMasterKey),
)

/**
 * GET /api/master-key/metadata
 * Get master key metadata for debugging/auditing
 *
 * Response:
 * {
 *   success: true,
 *   data: {
 *     metadata: {
 *       derivationAlgorithm: string,
 *       derivationParams: { memory, iterations, parallelism },
 *       createdAt: string,
 *       updatedAt: string,
 *       lastAccessedAt: string,
 *       deviceId: string
 *     },
 *     audit: {
 *       accessCount: number,
 *       lastAccessedByDeviceId: string,
 *       failedDecryptionAttempts: number,
 *       lastFailedAttempt: string
 *     }
 *   }
 * }
 */
masterKeyRouter.get(
  '/metadata',
  requireAuth,
  readMasterKeyAuditLimiter,
  asyncHandler(handleGetMasterKeyMetadata),
)

/**
 * GET /api/master-key/full-data
 * Get complete master key data including encrypted components
 * Shows encrypted payload structure and metadata
 *
 * Response:
 * {
 *   success: true,
 *   data: {
 *     userId: string,
 *     masterKey: {
 *       encryptedMasterKey: {
 *         encryption: { algorithm, keyVersion, components }
 *         security: { cipherTextPreview, ivPreview, authTagPreview, saltPreview }
 *       },
 *       masterKeyHashPreview: string,
 *       metadata: { ... },
 *       audit: { ... },
 *       createdAt: Date,
 *       updatedAt: Date
 *     },
 *     timestamp: string,
 *     note: string
 *   }
 * }
 */
masterKeyRouter.get(
  '/full-data',
  requireAuth,
  readMasterKeyAuditLimiter,
  asyncHandler(handleGetMasterKeyFullData),
)

export default masterKeyRouter

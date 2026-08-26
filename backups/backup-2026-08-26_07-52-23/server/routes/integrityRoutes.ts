import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/authMiddleware.ts';
import { asyncHandler } from '../utils/asyncHandler.ts';
import {
  getIntegrityStatusController,
  verifyVaultIntegrityController,
  getMerkleProofController,
  reportTamperController,
} from '../controllers/integrityController.ts';

export const integrityRouter = Router();

const integrityLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Too many integrity requests. Please slow down.' },
});

integrityRouter.use(requireAuth);
integrityRouter.use(integrityLimiter);

/**
 * GET /api/vault/integrity/status
 * Fetches current Merkle root and audit state
 */
integrityRouter.get('/status', asyncHandler(getIntegrityStatusController));

/**
 * POST /api/vault/integrity/verify
 * Runs full cryptographic Merkle audit across vault files (scans for bit-flips)
 */
integrityRouter.post('/verify', asyncHandler(verifyVaultIntegrityController));

/**
 * GET /api/vault/integrity/proof/:itemId
 * Fetches cryptographic Merkle inclusion proof for a photo/item
 */
integrityRouter.get('/proof/:itemId', asyncHandler(getMerkleProofController));

/**
 * POST /api/vault/integrity/report-tamper
 * Client reports bit-flip or corrupted decryption to trigger system alarm
 */
integrityRouter.post('/report-tamper', asyncHandler(reportTamperController));

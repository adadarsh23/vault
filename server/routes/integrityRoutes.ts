import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/authMiddleware.ts';
import { requireTrustedBrowserOrigin } from '../middleware/csrfOriginMiddleware.ts';
import { validateRequest } from '../middleware/expressValidate.ts';
import { vaultItemRouteParamsValidation } from '../validators/requestChainValidator.ts';
import { asyncHandler } from '../utils/asyncHandler.ts';
import { getClientIp } from '../utils/requestIp.ts';
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
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const userId = (req as any)?.user?.userId || 'anonymous';
    return `${getClientIp(req)}:${userId}:integrity`;
  },
  message: {
    success: false,
    message: 'Too many integrity requests. Please slow down.',
    error: { code: 'TOO_MANY_INTEGRITY_REQUESTS' },
  },
});

integrityRouter.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
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
integrityRouter.post(
  '/verify',
  requireTrustedBrowserOrigin,
  asyncHandler(verifyVaultIntegrityController),
);

/**
 * GET /api/vault/integrity/proof/:itemId
 * Fetches cryptographic Merkle inclusion proof for a photo/item
 */
integrityRouter.get(
  '/proof/:itemId',
  validateRequest(vaultItemRouteParamsValidation),
  asyncHandler(getMerkleProofController),
);

/**
 * POST /api/vault/integrity/report-tamper
 * Client reports bit-flip or corrupted decryption to trigger system alarm
 */
integrityRouter.post(
  '/report-tamper',
  requireTrustedBrowserOrigin,
  asyncHandler(reportTamperController),
);

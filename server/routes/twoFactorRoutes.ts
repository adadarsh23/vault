import { Router } from 'express';
import * as twoFactorController from '../controllers/twoFactorController.ts';
import { requireAuth } from '../middleware/authMiddleware.ts';
import { asyncHandler } from '../utils/asyncHandler.ts';
import rateLimit from 'express-rate-limit';
import { getClientIp } from '../utils/requestIp.ts';
import { requireTrustedBrowserOrigin } from '../middleware/csrfOriginMiddleware.ts';
import { requireRecaptcha } from '../middleware/recaptchaMiddleware.ts';
import { validate } from '../middleware/validate.ts';
import { login2FASchema, twoFactorTokenSchema } from '../validators/twoFactorValidator.ts';

const router = Router();

// Prevent browser/proxy caching of sensitive 2FA setup secrets and tokens
router.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

const twoFactorLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // Stricter limit for 2FA actions
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const userId = (req as any)?.user?.userId || 'anon';
    return `${getClientIp(req)}:${userId}:${req.path}`;
  },
  message: {
    success: false,
    message: 'Too many 2FA attempts. Please try again later.',
    error: { code: 'TOO_MANY_2FA_ATTEMPTS' },
  },
});

router.post(
  '/setup',
  requireTrustedBrowserOrigin,
  requireAuth,
  twoFactorLimiter,
  asyncHandler(twoFactorController.setup2FA),
);
router.post(
  '/verify',
  requireTrustedBrowserOrigin,
  requireAuth,
  twoFactorLimiter,
  validate(twoFactorTokenSchema),
  asyncHandler(twoFactorController.verifyAndEnable2FA),
);
router.post(
  '/login',
  requireTrustedBrowserOrigin,
  requireRecaptcha({ action: 'auth_2fa_login', optional: true }),
  twoFactorLimiter,
  validate(login2FASchema),
  asyncHandler(twoFactorController.login2FA),
);
router.post(
  '/disable',
  requireTrustedBrowserOrigin,
  requireAuth,
  twoFactorLimiter,
  validate(twoFactorTokenSchema),
  asyncHandler(twoFactorController.disable2FA),
);

export const twoFactorRouter = router;

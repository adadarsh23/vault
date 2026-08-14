import express from 'express';
import rateLimit from 'express-rate-limit';
import {
  changePassword,
  checkUsername,
  getSalt,
  getMe,
  login,
  logout,
  refreshSession,
  register,
  revokeSessions,
  updateDeviceName,
  updateProfile,
} from '../controllers/authController.ts';
import {
  verifyCloudUnlockCaptcha,
  verifyMasterKeyCaptcha,
} from '../controllers/captchaController.ts';
import { requireAuth } from '../middleware/authMiddleware.ts';
import { requireRecaptcha } from '../middleware/recaptchaMiddleware.ts';
import { validate } from '../middleware/validate.ts';
import { validateRequest } from '../middleware/expressValidate.ts';
import {
  changePasswordSchema,
  cloudUnlockCaptchaSchema,
  loginSchema,
  masterKeyCaptchaSchema,
  registerSchema,
  updateProfileSchema,
} from '../validators/authValidator.ts';
import {
  deviceSessionRenameValidation,
  revokeSessionsValidation,
  usernameQueryValidation,
} from '../validators/requestChainValidator.ts';
import { asyncHandler } from '../utils/asyncHandler.ts';
import { getClientIp } from '../utils/requestIp.ts';
import { requireTrustedBrowserOrigin } from '../middleware/csrfOriginMiddleware.ts';

export const authRouter = express.Router();

// Prevent browser/proxy caching of auth endpoints and token-bearing responses.
authRouter.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

const toPositiveInteger = (raw: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(raw || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const normalizeRateLimitKeySegment = (value: unknown): string => {
  if (typeof value !== 'string') {
    return 'anonymous';
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return 'anonymous';
  }

  return normalized.slice(0, 128);
};

const authLimiterWindowMs = toPositiveInteger(
  process.env.AUTH_RATE_LIMIT_WINDOW_MS,
  15 * 60 * 1000
);
const authLimiterMax = toPositiveInteger(process.env.AUTH_RATE_LIMIT_MAX, 20);
const refreshLimiterMax = toPositiveInteger(process.env.AUTH_REFRESH_RATE_LIMIT_MAX, 30);
const changePasswordLimiterMax = toPositiveInteger(
  process.env.AUTH_CHANGE_PASSWORD_RATE_LIMIT_MAX,
  5
);

const getAuthRateLimitKey = (req: express.Request) => {
  const username = normalizeRateLimitKeySegment(req.body?.username);
  return `${getClientIp(req)}:${req.path}:${username}`;
};

const authLimiter = rateLimit({
  windowMs: authLimiterWindowMs,
  max: authLimiterMax,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getAuthRateLimitKey,
  message: {
    success: false,
    message: 'Too many authentication attempts. Please try again later.',
    error: { code: 'TOO_MANY_AUTH_ATTEMPTS' },
  },
});

const refreshLimiter = rateLimit({
  windowMs: authLimiterWindowMs,
  max: refreshLimiterMax,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${getClientIp(req)}:${req.path}`,
  message: {
    success: false,
    message: 'Too many authentication attempts. Please try again later.',
    error: { code: 'TOO_MANY_AUTH_ATTEMPTS' },
  },
});

const usernameCheckLimiter = rateLimit({
  windowMs: authLimiterWindowMs,
  max: toPositiveInteger(process.env.AUTH_USERNAME_CHECK_RATE_LIMIT_MAX, 40),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const username = normalizeRateLimitKeySegment(req.query?.username);
    return `${getClientIp(req)}:${req.path}:${username}`;
  },
  message: {
    success: false,
    message: 'Too many username checks. Please try again later.',
    error: { code: 'TOO_MANY_USERNAME_CHECKS' },
  },
});

const changePasswordLimiter = rateLimit({
  windowMs: authLimiterWindowMs,
  max: changePasswordLimiterMax,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    `${getClientIp(req)}:${req.path}:${normalizeRateLimitKeySegment((req as any).user?.userId)}`,
  message: {
    success: false,
    message: 'Too many password change attempts. Please try again later.',
    error: { code: 'TOO_MANY_PASSWORD_CHANGE_ATTEMPTS' },
  },
});

const masterKeyCaptchaLimiter = rateLimit({
  windowMs: authLimiterWindowMs,
  max: toPositiveInteger(process.env.MASTER_KEY_CAPTCHA_RATE_LIMIT_MAX, 6),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    `${getClientIp(req)}:${req.path}:${normalizeRateLimitKeySegment((req as any).user?.userId)}`,
  message: {
    success: false,
    message: 'Too many master key verification attempts. Please try again later.',
    error: { code: 'TOO_MANY_MASTER_KEY_CAPTCHA_ATTEMPTS' },
  },
});

const cloudUnlockCaptchaLimiter = rateLimit({
  windowMs: authLimiterWindowMs,
  max: toPositiveInteger(process.env.AUTH_CLOUD_UNLOCK_CAPTCHA_RATE_LIMIT_MAX, 12),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${getClientIp(req)}:${req.path}`,
  message: {
    success: false,
    message: 'Too many unlock verification attempts. Please try again later.',
    error: { code: 'TOO_MANY_UNLOCK_CAPTCHA_ATTEMPTS' },
  },
});

// Routes
authRouter.post(
  '/signup',
  requireTrustedBrowserOrigin,
  authLimiter,
  validate(registerSchema),
  requireRecaptcha({ action: 'auth_register' }),
  asyncHandler(register)
);
authRouter.post(
  '/register',
  requireTrustedBrowserOrigin,
  authLimiter,
  validate(registerSchema),
  requireRecaptcha({ action: 'auth_register' }),
  asyncHandler(register)
);
authRouter.post(
  '/login',
  requireTrustedBrowserOrigin,
  authLimiter,
  validate(loginSchema),
  requireRecaptcha({ action: 'auth_login' }),
  asyncHandler(login)
);
authRouter.get(
  '/username-check',
  usernameCheckLimiter,
  validateRequest(usernameQueryValidation),
  asyncHandler(checkUsername)
);
authRouter.get(
  '/salt',
  usernameCheckLimiter,
  validateRequest(usernameQueryValidation),
  asyncHandler(getSalt)
);
authRouter.post(
  '/refresh',
  requireTrustedBrowserOrigin,
  refreshLimiter,
  asyncHandler(refreshSession)
);
// Backward-compatible aliases for clients still using legacy refresh paths.
authRouter.post(
  '/refresh-session',
  requireTrustedBrowserOrigin,
  refreshLimiter,
  asyncHandler(refreshSession)
);
authRouter.post(
  '/session/refresh',
  requireTrustedBrowserOrigin,
  refreshLimiter,
  asyncHandler(refreshSession)
);
authRouter.post('/logout', requireTrustedBrowserOrigin, asyncHandler(logout));
authRouter.get('/me', requireAuth, asyncHandler(getMe));
authRouter.post(
  '/sessions/revoke',
  requireTrustedBrowserOrigin,
  requireAuth,
  validateRequest(revokeSessionsValidation),
  asyncHandler(revokeSessions)
);
authRouter.post(
  '/sessions/device-name',
  requireTrustedBrowserOrigin,
  requireAuth,
  validateRequest(deviceSessionRenameValidation),
  asyncHandler(updateDeviceName)
);
authRouter.post(
  '/profile',
  requireTrustedBrowserOrigin,
  requireAuth,
  validate(updateProfileSchema),
  asyncHandler(updateProfile)
);
authRouter.put(
  '/profile',
  requireTrustedBrowserOrigin,
  requireAuth,
  validate(updateProfileSchema),
  asyncHandler(updateProfile)
);
authRouter.patch(
  '/profile',
  requireTrustedBrowserOrigin,
  requireAuth,
  validate(updateProfileSchema),
  asyncHandler(updateProfile)
);
authRouter.post(
  '/me/profile',
  requireTrustedBrowserOrigin,
  requireAuth,
  validate(updateProfileSchema),
  asyncHandler(updateProfile)
);
authRouter.put(
  '/me',
  requireTrustedBrowserOrigin,
  requireAuth,
  validate(updateProfileSchema),
  asyncHandler(updateProfile)
);
authRouter.patch(
  '/me',
  requireTrustedBrowserOrigin,
  requireAuth,
  validate(updateProfileSchema),
  asyncHandler(updateProfile)
);
authRouter.post(
  '/change-password',
  requireTrustedBrowserOrigin,
  requireAuth,
  changePasswordLimiter,
  validate(changePasswordSchema),
  requireRecaptcha({ action: 'auth_change_password' }),
  asyncHandler(changePassword)
);
authRouter.post(
  '/captcha/verify-cloud-unlock',
  requireTrustedBrowserOrigin,
  cloudUnlockCaptchaLimiter,
  validate(cloudUnlockCaptchaSchema),
  requireRecaptcha({ action: 'auth_cloud_unlock' }),
  asyncHandler(verifyCloudUnlockCaptcha)
);
authRouter.post(
  '/captcha/verify-master-key-change',
  requireTrustedBrowserOrigin,
  requireAuth,
  masterKeyCaptchaLimiter,
  validate(masterKeyCaptchaSchema),
  requireRecaptcha({ action: 'master_key_change' }),
  asyncHandler(verifyMasterKeyCaptcha)
);

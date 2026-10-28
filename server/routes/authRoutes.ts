import express from 'express';
import rateLimit from 'express-rate-limit';
import {
  checkSessionStatus,
  changePassword,
  checkUsername,
  getSalt,
  getMe,
  login,
  logout,
  refreshSession,
  register,
  revokeSessions,
  sessionStream,
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
authRouter.use((_req: express.Request, res: express.Response, next: express.NextFunction) => {
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

const isDev = process.env.NODE_ENV !== 'production';

const authLimiterWindowMs = toPositiveInteger(
  process.env.AUTH_RATE_LIMIT_WINDOW_MS,
  15 * 60 * 1000,
);
const authLimiterMax = toPositiveInteger(process.env.AUTH_RATE_LIMIT_MAX, isDev ? 500 : 100);
const refreshLimiterMax = toPositiveInteger(
  process.env.AUTH_REFRESH_RATE_LIMIT_MAX,
  isDev ? 500 : 100,
);
const usernameCheckLimiterMax = toPositiveInteger(
  process.env.AUTH_USERNAME_CHECK_RATE_LIMIT_MAX,
  isDev ? 1000 : 200,
);
const changePasswordLimiterMax = toPositiveInteger(
  process.env.AUTH_CHANGE_PASSWORD_RATE_LIMIT_MAX,
  isDev ? 50 : 20,
);
const masterKeyCaptchaLimiterMax = toPositiveInteger(
  process.env.MASTER_KEY_CAPTCHA_RATE_LIMIT_MAX,
  isDev ? 100 : 30,
);
const cloudUnlockCaptchaLimiterMax = toPositiveInteger(
  process.env.AUTH_CLOUD_UNLOCK_CAPTCHA_RATE_LIMIT_MAX,
  isDev ? 200 : 50,
);

const getAuthRateLimitKey = (req: express.Request) => {
  const username = normalizeRateLimitKeySegment(req.body?.username);
  return `${getClientIp(req)}:${req.path}:${username}`;
};

const ipAuthLimiter = rateLimit({
  windowMs: authLimiterWindowMs,
  max: authLimiterMax * 2,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${getClientIp(req)}:auth-ip-pool`,
  message: {
    success: false,
    message: 'Too many authentication attempts from this IP address. Please try again later.',
    error: { code: 'TOO_MANY_AUTH_ATTEMPTS' },
  },
});

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
  max: usernameCheckLimiterMax,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${getClientIp(req)}:${req.path}`,
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
    error: { code: 'TOO_MANY_CHANGE_PASSWORD_ATTEMPTS' },
  },
});

const masterKeyCaptchaLimiter = rateLimit({
  windowMs: authLimiterWindowMs,
  max: masterKeyCaptchaLimiterMax,
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
  max: cloudUnlockCaptchaLimiterMax,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    `${getClientIp(req)}:${req.path}:${normalizeRateLimitKeySegment((req as any).user?.userId)}`,
  message: {
    success: false,
    message: 'Too many unlock verification attempts. Please try again later.',
    error: { code: 'TOO_MANY_UNLOCK_CAPTCHA_ATTEMPTS' },
  },
});

const profileUpdateLimiter = rateLimit({
  windowMs: authLimiterWindowMs,
  max: isDev ? 120 : 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    `${getClientIp(req)}:${normalizeRateLimitKeySegment((req as any).user?.userId)}:profile`,
  message: {
    success: false,
    message: 'Too many profile update requests. Please try again later.',
    error: { code: 'TOO_MANY_PROFILE_UPDATE_ATTEMPTS' },
  },
});

const sessionMgmtLimiter = rateLimit({
  windowMs: authLimiterWindowMs,
  max: isDev ? 120 : 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    `${getClientIp(req)}:${normalizeRateLimitKeySegment((req as any).user?.userId)}:session-mgmt`,
  message: {
    success: false,
    message: 'Too many session management requests. Please try again later.',
    error: { code: 'TOO_MANY_SESSION_MGMT_ATTEMPTS' },
  },
});

const logoutLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: isDev ? 100 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${getClientIp(req)}:logout`,
  message: {
    success: false,
    message: 'Too many logout requests. Please try again later.',
    error: { code: 'TOO_MANY_LOGOUT_ATTEMPTS' },
  },
});

// Routes
authRouter.post(
  '/signup',
  requireTrustedBrowserOrigin,
  ipAuthLimiter,
  authLimiter,
  validate(registerSchema),
  requireRecaptcha({ action: 'auth_register' }),
  asyncHandler(register),
);
authRouter.post(
  '/register',
  requireTrustedBrowserOrigin,
  ipAuthLimiter,
  authLimiter,
  validate(registerSchema),
  requireRecaptcha({ action: 'auth_register' }),
  asyncHandler(register),
);
authRouter.post(
  '/login',
  requireTrustedBrowserOrigin,
  ipAuthLimiter,
  authLimiter,
  validate(loginSchema),
  requireRecaptcha({ action: 'auth_login' }),
  asyncHandler(login),
);
authRouter.get(
  '/username-check',
  usernameCheckLimiter,
  validateRequest(usernameQueryValidation),
  asyncHandler(checkUsername),
);
authRouter.get(
  '/salt',
  usernameCheckLimiter,
  validateRequest(usernameQueryValidation),
  asyncHandler(getSalt),
);
authRouter.post(
  '/refresh',
  requireTrustedBrowserOrigin,
  refreshLimiter,
  asyncHandler(refreshSession),
);
// Backward-compatible aliases for clients still using legacy refresh paths.
authRouter.post(
  '/refresh-session',
  requireTrustedBrowserOrigin,
  refreshLimiter,
  asyncHandler(refreshSession),
);
authRouter.post(
  '/session/refresh',
  requireTrustedBrowserOrigin,
  refreshLimiter,
  asyncHandler(refreshSession),
);
authRouter.post('/logout', requireTrustedBrowserOrigin, logoutLimiter, asyncHandler(logout));
authRouter.get('/me', requireAuth, asyncHandler(getMe));
authRouter.get('/session-check', requireAuth, asyncHandler(checkSessionStatus));
authRouter.get('/session-stream', requireAuth, asyncHandler(sessionStream));
authRouter.get('/stream/session', requireAuth, asyncHandler(sessionStream));
authRouter.post(
  '/sessions/revoke',
  requireTrustedBrowserOrigin,
  requireAuth,
  sessionMgmtLimiter,
  validateRequest(revokeSessionsValidation),
  asyncHandler(revokeSessions),
);
authRouter.post(
  '/sessions/device-name',
  requireTrustedBrowserOrigin,
  requireAuth,
  sessionMgmtLimiter,
  validateRequest(deviceSessionRenameValidation),
  asyncHandler(updateDeviceName),
);
authRouter.post(
  '/profile',
  requireTrustedBrowserOrigin,
  requireAuth,
  profileUpdateLimiter,
  validate(updateProfileSchema),
  asyncHandler(updateProfile),
);
authRouter.put(
  '/profile',
  requireTrustedBrowserOrigin,
  requireAuth,
  profileUpdateLimiter,
  validate(updateProfileSchema),
  asyncHandler(updateProfile),
);
authRouter.patch(
  '/profile',
  requireTrustedBrowserOrigin,
  requireAuth,
  profileUpdateLimiter,
  validate(updateProfileSchema),
  asyncHandler(updateProfile),
);
authRouter.post(
  '/me/profile',
  requireTrustedBrowserOrigin,
  requireAuth,
  profileUpdateLimiter,
  validate(updateProfileSchema),
  asyncHandler(updateProfile),
);
authRouter.put(
  '/me',
  requireTrustedBrowserOrigin,
  requireAuth,
  profileUpdateLimiter,
  validate(updateProfileSchema),
  asyncHandler(updateProfile),
);
authRouter.patch(
  '/me',
  requireTrustedBrowserOrigin,
  requireAuth,
  profileUpdateLimiter,
  validate(updateProfileSchema),
  asyncHandler(updateProfile),
);
authRouter.post(
  '/change-password',
  requireTrustedBrowserOrigin,
  requireAuth,
  changePasswordLimiter,
  validate(changePasswordSchema),
  requireRecaptcha({ action: 'auth_change_password' }),
  asyncHandler(changePassword),
);
authRouter.post(
  '/captcha/verify-cloud-unlock',
  requireTrustedBrowserOrigin,
  cloudUnlockCaptchaLimiter,
  validate(cloudUnlockCaptchaSchema),
  requireRecaptcha({ action: 'auth_cloud_unlock' }),
  asyncHandler(verifyCloudUnlockCaptcha),
);
authRouter.post(
  '/captcha/verify-master-key-change',
  requireTrustedBrowserOrigin,
  requireAuth,
  masterKeyCaptchaLimiter,
  validate(masterKeyCaptchaSchema),
  requireRecaptcha({ action: 'master_key_change' }),
  asyncHandler(verifyMasterKeyCaptcha),
);

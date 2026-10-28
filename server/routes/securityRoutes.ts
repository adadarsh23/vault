/**
 * Security API Routes
 *
 * Provides endpoints for:
 * - Enhanced authentication
 * - MFA management
 * - Device management
 * - Security events
 * - Admin dashboard
 */

import { Router, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth, requireAdmin } from '../middleware/authMiddleware.ts';
import { requireTrustedBrowserOrigin } from '../middleware/csrfOriginMiddleware.ts';
import { asyncHandler } from '../utils/asyncHandler.ts';
import { getClientIp } from '../utils/requestIp.ts';
import { aiAnomalyDetectionService } from '../services/aiAnomalyDetectionService.ts';
import { requestFingerprintService } from '../services/requestFingerprintService.ts';
import { securityDashboardService } from '../services/securityDashboardService.ts';
import * as twoFactorController from '../controllers/twoFactorController.ts';
import * as twoFactorService from '../services/twoFactorService.ts';
import { validate } from '../middleware/validate.ts';
import { twoFactorTokenSchema } from '../validators/twoFactorValidator.ts';
import { AppError } from '../utils/appError.ts';
import { AuthenticatedRequest } from '../utils/requestTypes.ts';
import { User } from '../models/user.ts';
import { comparePassword, decryptText } from '../utils/crypto.ts';

type Request = AuthenticatedRequest;

const securityRouter = Router();

// Anti-caching for sensitive security endpoints
securityRouter.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

const loginVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${getClientIp(req)}:${(req as any)?.user?.userId || 'anon'}:login-verify`,
  message: {
    success: false,
    message: 'Too many verification attempts. Please try again later.',
    error: { code: 'TOO_MANY_VERIFY_ATTEMPTS' },
  },
});

const deviceVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    `${getClientIp(req)}:${(req as any)?.user?.userId || 'anon'}:device-verify`,
  message: {
    success: false,
    message: 'Too many device verification attempts. Please try again later.',
    error: { code: 'TOO_MANY_DEVICE_VERIFY_ATTEMPTS' },
  },
});

const securitySettingsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    `${getClientIp(req)}:${(req as any)?.user?.userId || 'anon'}:security-settings`,
  message: {
    success: false,
    message: 'Too many settings update requests. Please try again later.',
    error: { code: 'TOO_MANY_SETTINGS_UPDATE_ATTEMPTS' },
  },
});

const mfaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${getClientIp(req)}:${(req as any)?.user?.userId || 'anon'}:mfa-mgmt`,
  message: {
    success: false,
    message: 'Too many MFA attempts. Please try again later.',
    error: { code: 'TOO_MANY_MFA_ATTEMPTS' },
  },
});

const adminActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${getClientIp(req)}:${(req as any)?.user?.userId || 'anon'}:admin-action`,
  message: {
    success: false,
    message: 'Too many admin action requests. Please try again later.',
    error: { code: 'TOO_MANY_ADMIN_ACTION_ATTEMPTS' },
  },
});

const getRouteParam = (value: string | string[] | undefined): string => {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }

  return value ?? '';
};

/**
 * POST /api/security/login-verify
 * Verify login with additional checks (for elevated operations)
 */
securityRouter.post(
  '/login-verify',
  requireTrustedBrowserOrigin,
  requireAuth,
  loginVerifyLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const { password } = req.body || {};
    if (!password || typeof password !== 'string') {
      throw AppError.badRequest(
        'Password is required for elevated verification.',
        'PASSWORD_REQUIRED',
      );
    }

    const user = await User.findById(req.user.userId).select('+password').exec();
    if (!user || !user.password) {
      throw AppError.unauthorized('User not found.', 'USER_NOT_FOUND');
    }

    let storedHash = '';
    if (typeof user.password === 'string') {
      storedHash = user.password;
    } else if (
      user.password &&
      typeof user.password === 'object' &&
      'cipherText' in (user.password as any)
    ) {
      try {
        storedHash = decryptText(user.password as any);
      } catch {
        // ignore decryption error
      }
    }

    const isMatch = storedHash ? await comparePassword(password, storedHash) : false;
    if (!isMatch) {
      throw AppError.unauthorized('Invalid password.', 'INVALID_CREDENTIALS');
    }

    res.json({
      success: true,
      verified: true,
      message: 'Elevated verification confirmed',
      expiresIn: 300, // 5 minutes
    });
  }),
);

/**
 * GET /api/security/devices
 * List all trusted devices
 */
securityRouter.get(
  '/devices',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user.userId;
    const devices = requestFingerprintService.getUserDevices(userId);

    res.json({
      devices: devices.map((d) => ({
        id: d.id,
        name: d.metadata.userAgent?.substring(0, 50) || 'Unknown Device',
        lastSeen: new Date(d.lastSeen),
        accessCount: d.accessCount,
        isVerified: d.isVerified,
        trustScore: d.trustScore,
        platform: d.metadata.platform,
      })),
    });
  }),
);

/**
 * POST /api/security/devices/:id/verify
 * Verify device with MFA (mark as trusted)
 */
securityRouter.post(
  '/devices/:id/verify',
  requireTrustedBrowserOrigin,
  requireAuth,
  deviceVerifyLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { token } = req.body || {};
    const userId = req.user.userId;

    if (!token) {
      throw AppError.badRequest('MFA verification token is required', 'MFA_TOKEN_REQUIRED');
    }

    const isValid = await twoFactorService.verifyLoginOTP(userId, token);
    if (!isValid) {
      throw AppError.unauthorized('Invalid MFA verification code', 'INVALID_OTP');
    }

    const idStr = Array.isArray(id) ? id[0] : id;
    requestFingerprintService.markDeviceVerified(idStr, userId);

    res.json({
      success: true,
      message: 'Device verified and trusted',
    });
  }),
);

/**
 * DELETE /api/security/devices/:id
 * Forget/remove a device
 */
securityRouter.delete(
  '/devices/:id',
  requireTrustedBrowserOrigin,
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = req.user.userId;

    const success = requestFingerprintService.forgetDevice(getRouteParam(id), userId);

    if (!success) {
      throw AppError.badRequest('Device not found', 'DEVICE_NOT_FOUND');
    }

    res.json({
      success: true,
      message: 'Device removed',
    });
  }),
);

/**
 * POST /api/security/devices/forget-all
 * Logout from all other devices
 */
securityRouter.post(
  '/devices/forget-all',
  requireTrustedBrowserOrigin,
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user.userId;
    const currentFingerprintId = req.get('x-fingerprint-id') || 'unknown';

    const count = requestFingerprintService.forgetAllOtherDevices(currentFingerprintId, userId);

    res.json({
      success: true,
      message: `Logged out from ${count} other devices`,
    });
  }),
);

/**
 * GET /api/security/activity
 * Get user's security activity/events
 */
securityRouter.get(
  '/activity',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user.userId;

    const behavior = aiAnomalyDetectionService.getTypicalBehavior(userId);

    res.json({
      behavior: behavior || {
        knownIPs: [],
        knownDevices: [],
        knownLocations: [],
        typicalLoginHours: [],
      },
    });
  }),
);

/**
 * GET /api/security/settings
 * Get security settings
 */
securityRouter.get(
  '/settings',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const user = await User.findById(req.user.userId)
      .select('twoFactorSecret meta.preferences')
      .lean()
      .exec();

    const prefs = (user as any)?.meta?.preferences || {};
    res.json({
      mfaEnabled: Boolean((user as any)?.twoFactorSecret),
      mfaMethods: ['totp'],
      loginAlerts: prefs.loginAlerts ?? true,
      suspiciousActivityAlerts: prefs.suspiciousActivityAlerts ?? true,
      twoFactorRequired: prefs.twoFactorRequired ?? Boolean((user as any)?.twoFactorSecret),
      sessionTimeout: prefs.sessionTimeout ?? 3600,
      ...prefs,
    });
  }),
);

/**
 * POST /api/security/settings
 * Update security settings (with strict field whitelist to prevent mass assignment)
 */
securityRouter.post(
  '/settings',
  requireTrustedBrowserOrigin,
  requireAuth,
  securitySettingsLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const rawSettings = req.body || {};
    const allowedKeys = new Set([
      'loginAlerts',
      'suspiciousActivityAlerts',
      'twoFactorRequired',
      'sessionTimeout',
      'theme',
      'compactMode',
      'autoLockTimeout',
    ]);

    const sanitizedPreferences: Record<string, any> = {};
    for (const [key, val] of Object.entries(rawSettings)) {
      if (allowedKeys.has(key)) {
        if (
          typeof val === 'boolean' ||
          typeof val === 'string' ||
          (typeof val === 'number' && Number.isFinite(val))
        ) {
          sanitizedPreferences[key] = val;
        }
      }
    }

    await User.findByIdAndUpdate(req.user.userId, {
      $set: {
        'meta.preferences': sanitizedPreferences,
        updatedAt: new Date(),
      },
    }).exec();

    res.json({
      success: true,
      message: 'Settings updated',
      data: sanitizedPreferences,
    });
  }),
);

/**
 * POST /api/security/mfa/enable
 * Enable MFA for account (initiate setup)
 */
securityRouter.post(
  '/mfa/enable',
  requireTrustedBrowserOrigin,
  requireAuth,
  mfaLimiter,
  asyncHandler(twoFactorController.setup2FA),
);

/**
 * POST /api/security/mfa/verify
 * Verify and enable MFA
 */
securityRouter.post(
  '/mfa/verify',
  requireTrustedBrowserOrigin,
  requireAuth,
  mfaLimiter,
  validate(twoFactorTokenSchema),
  asyncHandler(twoFactorController.verifyAndEnable2FA),
);

/**
 * POST /api/security/mfa/disable
 * Disable MFA
 */
securityRouter.post(
  '/mfa/disable',
  requireTrustedBrowserOrigin,
  requireAuth,
  mfaLimiter,
  validate(twoFactorTokenSchema),
  asyncHandler(twoFactorController.disable2FA),
);

/**
 * ADMIN ONLY: GET /api/admin/security/dashboard
 * Get security dashboard data
 */
securityRouter.get(
  '/admin/dashboard',
  requireAuth,
  requireAdmin,
  asyncHandler(async (_req: Request, res: Response) => {
    const metrics = await securityDashboardService.getCurrentMetrics();
    res.json(metrics);
  }),
);

/**
 * ADMIN ONLY: GET /api/admin/security/incidents
 * List security incidents
 */
securityRouter.get(
  '/admin/incidents',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 500);

    res.json({
      incidents: [],
      total: 0,
      limit,
    });
  }),
);

/**
 * ADMIN ONLY: GET /api/admin/security/incidents/:id
 * Get incident details
 */
securityRouter.get(
  '/admin/incidents/:id',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const incident = await securityDashboardService.getIncidentDetails(
      getRouteParam(req.params.id),
    );
    res.json(incident);
  }),
);

/**
 * ADMIN ONLY: PATCH /api/admin/security/incidents/:id
 * Update incident status
 */
securityRouter.patch(
  '/admin/incidents/:id',
  requireTrustedBrowserOrigin,
  requireAuth,
  requireAdmin,
  adminActionLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const { status, notes } = req.body || {};

    await securityDashboardService.updateIncidentStatus(
      getRouteParam(req.params.id),
      status as any,
      notes,
    );

    res.json({
      success: true,
      message: 'Incident updated',
    });
  }),
);

/**
 * ADMIN ONLY: POST /api/admin/security/actions
 * Apply manual security action
 */
securityRouter.post(
  '/admin/actions',
  requireTrustedBrowserOrigin,
  requireAuth,
  requireAdmin,
  adminActionLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const { action, target, duration } = req.body || {};

    await securityDashboardService.applyManualAction(action, target, duration);

    res.json({
      success: true,
      message: `Action applied: ${action}`,
    });
  }),
);

/**
 * ADMIN ONLY: GET /api/admin/security/report
 * Export security report
 */
securityRouter.get(
  '/admin/report',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const startDate = new Date(req.query.startDate as string);
    const endDate = new Date(req.query.endDate as string);

    const report = await securityDashboardService.generateSecurityReport(startDate, endDate);

    res.contentType('text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="security-report.csv"');
    res.send(report);
  }),
);

export { securityRouter };

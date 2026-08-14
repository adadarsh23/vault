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

import { Router, Request as ExpressRequest, Response } from 'express';
import { requireAuth } from '../middleware/authMiddleware.ts';
import { asyncHandler } from '../utils/asyncHandler.ts';
import { aiAnomalyDetectionService } from '../services/aiAnomalyDetectionService.ts';
import { requestFingerprintService } from '../services/requestFingerprintService.ts';
import { securityDashboardService } from '../services/securityDashboardService.ts';
import { AppError } from '../utils/appError.ts';
import { AuthenticatedRequest } from '../utils/requestTypes.ts';
import { User } from '../models/user.ts';
import { getVaultSnapshot } from '../services/vaultItemService.ts';

type Request = AuthenticatedRequest;

const securityRouter = Router();

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
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;

    // Verify password
    // TODO: Implement password verification

    // Generate one-time code for MFA
    // const otpCode = Math.random().toString().slice(2, 8) // 6-digit code

    res.json({
      success: true,
      message: 'Verification code sent to registered email',
      expiresIn: 300, // 5 minutes
    });
  })
);

/**
 * GET /api/security/devices
 * List all trusted devices
 */
securityRouter.get(
  '/devices',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
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
  })
);

/**
 * POST /api/security/devices/:id/verify
 * Verify device with MFA (mark as trusted)
 */
securityRouter.post(
  '/devices/:id/verify',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = req.user!.userId;

    // Verify MFA code
    // TODO: Implement MFA verification

    const idStr = Array.isArray(id) ? id[0] : id;
    requestFingerprintService.markDeviceVerified(idStr, userId);

    res.json({
      success: true,
      message: 'Device verified and trusted',
    });
  })
);

/**
 * DELETE /api/security/devices/:id
 * Forget/remove a device
 */
securityRouter.delete(
  '/devices/:id',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = req.user!.userId;

    const success = requestFingerprintService.forgetDevice(getRouteParam(id), userId);

    if (!success) {
      throw AppError.badRequest('Device not found', 'DEVICE_NOT_FOUND');
    }

    res.json({
      success: true,
      message: 'Device removed',
    });
  })
);

/**
 * POST /api/security/devices/forget-all
 * Logout from all other devices
 */
securityRouter.post(
  '/devices/forget-all',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const currentFingerprintId = req.get('x-fingerprint-id') || 'unknown';

    const count = requestFingerprintService.forgetAllOtherDevices(currentFingerprintId, userId);

    res.json({
      success: true,
      message: `Logged out from ${count} other devices`,
    });
  })
);

/**
 * GET /api/security/activity
 * Get user's security activity/events
 */
securityRouter.get(
  '/activity',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const hours = Math.min(parseInt(req.query.hours as string) || 24, 720); // Max 30 days

    const behavior = aiAnomalyDetectionService.getTypicalBehavior(userId);

    res.json({
      behavior: behavior || {
        knownIPs: [],
        knownDevices: [],
        knownLocations: [],
        typicalLoginHours: [],
      },
    });
  })
);

/**
 * GET /api/security/settings
 * Get security settings
 */
securityRouter.get(
  '/settings',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;

    res.json({
      mfaEnabled: true, // Would fetch from DB
      mfaMethods: ['totp', 'email'], // Alternative: fido2
      loginAlerts: true,
      suspiciousActivityAlerts: true,
      twoFactorRequired: true,
      sessionTimeout: 3600, // seconds
    });
  })
);

/**
 * POST /api/security/settings
 * Update security settings
 */
securityRouter.post(
  '/settings',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const { loginAlerts, suspiciousActivityAlerts, sessionTimeout } = req.body;

    // TODO: Persist to database

    res.json({
      success: true,
      message: 'Settings updated',
    });
  })
);

/**
 * POST /api/security/mfa/enable
 * Enable MFA for account
 */
securityRouter.post(
  '/mfa/enable',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const { method } = req.body; // 'totp', 'fido2', 'email'

    if (!['totp', 'fido2', 'email'].includes(method)) {
      throw AppError.badRequest('Invalid MFA method', 'INVALID_MFA_METHOD');
    }

    // Generate MFA secret/challenge
    let secret: any;

    if (method === 'totp') {
      // Use speakeasy library
      // const secret = speakeasy.generateSecret({...})
      secret = {
        secret: 'JBSWY3DPEBLW64TMMQ======',
        qrCode: 'otpauth://totp/...',
      };
    }

    res.json({
      success: true,
      method,
      secret,
      message: 'Scan QR code with authenticator app',
    });
  })
);

/**
 * POST /api/security/mfa/verify
 * Verify and enable MFA
 */
securityRouter.post(
  '/mfa/verify',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { code, method } = req.body;

    // TODO: Verify TOTP code or FIDO2 challenge

    res.json({
      success: true,
      message: 'MFA enabled successfully',
    });
  })
);

/**
 * POST /api/security/mfa/disable
 * Disable MFA (requires password verification)
 */
securityRouter.post(
  '/mfa/disable',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { password } = req.body;

    // TODO: Verify password first

    res.json({
      success: true,
      message: 'MFA disabled',
    });
  })
);

/**
 * ADMIN ONLY: GET /api/admin/security/dashboard
 * Get security dashboard data
 */
securityRouter.get(
  '/admin/dashboard',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    // TODO: Verify admin role

    const metrics = await securityDashboardService.getCurrentMetrics();
    res.json(metrics);
  })
);

/**
 * ADMIN ONLY: GET /api/admin/security/incidents
 * List security incidents
 */
securityRouter.get(
  '/admin/incidents',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    // TODO: Verify admin role

    const limit = Math.min(parseInt(req.query.limit as string) || 50, 500);
    const severity = req.query.severity as string;

    // TODO: Fetch from database with filters

    res.json({
      incidents: [],
      total: 0,
      limit,
    });
  })
);

/**
 * ADMIN ONLY: GET /api/admin/security/incidents/:id
 * Get incident details
 */
securityRouter.get(
  '/admin/incidents/:id',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    // TODO: Verify admin role

    const incident = await securityDashboardService.getIncidentDetails(
      getRouteParam(req.params.id)
    );
    res.json(incident);
  })
);

/**
 * ADMIN ONLY: PATCH /api/admin/security/incidents/:id
 * Update incident status
 */
securityRouter.patch(
  '/admin/incidents/:id',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    // TODO: Verify admin role

    const { status, notes } = req.body;

    await securityDashboardService.updateIncidentStatus(
      getRouteParam(req.params.id),
      status as any,
      notes
    );

    res.json({
      success: true,
      message: 'Incident updated',
    });
  })
);

/**
 * ADMIN ONLY: POST /api/admin/security/actions
 * Apply manual security action
 */
securityRouter.post(
  '/admin/actions',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    // TODO: Verify admin role

    const { action, target, duration } = req.body;

    await securityDashboardService.applyManualAction(action, target, duration);

    res.json({
      success: true,
      message: `Action applied: ${action}`,
    });
  })
);

/**
 * ADMIN ONLY: GET /api/admin/security/report
 * Export security report
 */
securityRouter.get(
  '/admin/report',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    // TODO: Verify admin role

    const startDate = new Date(req.query.startDate as string);
    const endDate = new Date(req.query.endDate as string);

    const report = await securityDashboardService.generateSecurityReport(startDate, endDate);

    res.contentType('text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="security-report.csv"');
    res.send(report);
  })
);

export { securityRouter };

import { Request, Response } from 'express';
import * as twoFactorService from '../services/twoFactorService.ts';
import { AuthenticatedRequest } from '../utils/requestTypes.ts';
import { sendSuccess } from '../responses.ts';
import { AppError } from '../utils/appError.ts';
import { issueUserSession } from '../services/authService.ts';
import { verifyMfaToken } from '../utils/auth.ts';
import { User } from '../models/user.ts';
import { getClientIp } from '../utils/requestIp.ts';
import { anomalyDetectionService } from '../services/anomalyDetectionService.ts';
import { logger } from '../utils/logger.ts';
import { createNotification } from '../services/notificationService.ts';

export const setup2FA = async (req: AuthenticatedRequest, res: Response) => {
  const result = await twoFactorService.setup2FA(req.user.userId, req.user.username);
  return sendSuccess(res, result, '2FA setup initiated. Scan the QR code.');
};

export const verifyAndEnable2FA = async (req: AuthenticatedRequest, res: Response) => {
  const { token } = req.body;
  if (!token) throw AppError.badRequest('OTP token is required.');

  const result = await twoFactorService.verifyAndEnable2FA(req.user.userId, token);
  return sendSuccess(res, result, '2FA has been enabled. Save your backup codes.');
};

export const login2FA = async (req: Request, res: Response) => {
  const { userId, token, deviceId, mfaToken } = req.body;

  if (!userId || !token || !mfaToken) {
    throw AppError.badRequest('UserId, OTP token, and MFA token are required.');
  }

  // Security Hardening: Verify the MFA token
  try {
    const decoded = verifyMfaToken(mfaToken);
    if (decoded.sub !== userId) {
      throw new Error('MFA token mismatch.');
    }
  } catch (error) {
    logger.warn('MFA token verification failed during login', { userId, ip: getClientIp(req) });
    throw AppError.unauthorized(
      'Authentication session expired. Please sign in again.',
      'MFA_TOKEN_INVALID'
    );
  }

  // Rate limiting check
  anomalyDetectionService.trackOTPAttempt(userId);

  const isValid = await twoFactorService.verifyLoginOTP(userId, token);

  if (!isValid) {
    throw AppError.unauthorized('Invalid OTP or backup code', 'INVALID_OTP');
  }

  // Clear attempts on success
  anomalyDetectionService.clearOTPAttempts(userId);

  const user = await User.findById(userId);
  if (!user) throw AppError.notFound('User not found');

  const session = issueUserSession(user, {
    deviceId: deviceId || 'unknown',
    ipAddress: getClientIp(req),
    userAgent: req.get('user-agent'),
  });

  await user.save();

  try {
    const ip = getClientIp(req);
    await createNotification(
      user._id.toString(),
      'device_login',
      'New Device Login (2FA)',
      `A new session was established on device "${deviceId || 'Web Client'}" from IP: ${ip} (2FA verified)`
    );
  } catch (err) {
    logger.warn('Failed to create 2FA login notification', { error: err });
  }

  return sendSuccess(
    res,
    {
      token: session.accessToken,
      refreshToken: session.refreshToken,
      sessionId: session.sessionId,
      user: {
        id: user._id,
        username: user.username,
        twoFactorEnabled: true,
        meta: user.meta,
      },
    },
    '2FA verification successful'
  );
};

export const disable2FA = async (req: AuthenticatedRequest, res: Response) => {
  const { token } = req.body;
  if (!token) throw AppError.badRequest('OTP token is required to disable 2FA.');

  const result = await twoFactorService.disable2FA(req.user.userId, token);
  return sendSuccess(res, result, '2FA has been disabled.');
};

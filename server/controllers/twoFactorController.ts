import { Request, Response } from 'express';
import mongoose from 'mongoose';
import * as twoFactorService from '../services/twoFactorService.ts';
import { AuthenticatedRequest } from '../utils/requestTypes.ts';
import { sendSuccess } from '../responses.ts';
import { AppError } from '../utils/appError.ts';
import { issueUserSession } from '../services/authService.ts';
import { applyRefreshCookie } from './authController.ts';
import { verifyMfaToken } from '../utils/auth.ts';
import { User } from '../models/user.ts';
import { getClientIp } from '../utils/requestIp.ts';
import { anomalyDetectionService } from '../services/anomalyDetectionService.ts';
import { logger } from '../utils/logger.ts';
import { createNotification } from '../services/notificationService.ts';

const sanitizeToken = (token: unknown): string => {
  if (typeof token !== 'string') return '';
  return token.trim().replace(/\s/g, '');
};

export const setup2FA = async (req: AuthenticatedRequest, res: Response) => {
  const result = await twoFactorService.setup2FA(req.user.userId, req.user.username);
  return sendSuccess(res, result, '2FA setup initiated. Scan the QR code.');
};

export const verifyAndEnable2FA = async (req: AuthenticatedRequest, res: Response) => {
  const token = sanitizeToken(req.body?.token);
  if (!token || token.length < 6 || token.length > 32) {
    throw AppError.badRequest('A valid OTP verification token is required.', 'INVALID_TOKEN');
  }

  const result = await twoFactorService.verifyAndEnable2FA(req.user.userId, token);
  return sendSuccess(res, result, '2FA has been enabled. Save your backup codes.');
};

export const login2FA = async (req: Request, res: Response) => {
  const { userId, token: rawToken, deviceId, mfaToken } = req.body || {};

  if (!userId || typeof userId !== 'string' || !rawToken || !mfaToken) {
    throw AppError.badRequest('UserId, OTP token, and MFA token are required.', 'INVALID_INPUT');
  }

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw AppError.badRequest('Invalid userId format.', 'INVALID_USER_ID');
  }

  const token = sanitizeToken(rawToken);
  if (!token || token.length < 6 || token.length > 32) {
    throw AppError.badRequest('Invalid OTP token format.', 'INVALID_TOKEN');
  }

  if (typeof mfaToken !== 'string') {
    throw AppError.badRequest('Invalid MFA token format.', 'INVALID_MFA_TOKEN');
  }

  // Security Hardening: Verify the MFA token
  try {
    const decoded = verifyMfaToken(mfaToken);
    if (decoded.sub !== userId) {
      throw new Error('MFA token mismatch.');
    }
  } catch {
    logger.warn('MFA token verification failed during login', { userId, ip: getClientIp(req) });
    throw AppError.unauthorized(
      'Authentication session expired. Please sign in again.',
      'MFA_TOKEN_INVALID',
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

  const cleanDeviceId =
    typeof deviceId === 'string' && deviceId.trim() ? deviceId.trim().slice(0, 128) : 'unknown';

  const session = issueUserSession(user, {
    deviceId: cleanDeviceId,
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
      `A new session was established on device "${cleanDeviceId}" from IP: ${ip} (2FA verified)`,
    );
  } catch (err) {
    logger.warn('Failed to create 2FA login notification', { error: err });
  }

  applyRefreshCookie(req, res, session.refreshToken);

  // Strip sensitive metadata (masterKey, masterKeyHash) from user response
  const safeUser = {
    id: user._id,
    username: user.username,
    twoFactorEnabled: true,
    profileName: user.profileName || user.username,
  };

  return sendSuccess(
    res,
    {
      token: session.accessToken,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      sessionId: session.sessionId,
      user: safeUser,
    },
    '2FA verification successful',
  );
};

export const disable2FA = async (req: AuthenticatedRequest, res: Response) => {
  const token = sanitizeToken(req.body?.token);
  const password = typeof req.body?.password === 'string' ? req.body.password.trim() : '';

  if (!token) {
    throw AppError.badRequest('OTP token is required to disable 2FA.', 'TOKEN_REQUIRED');
  }

  if (!password) {
    throw AppError.badRequest('Current password is required to disable 2FA.', 'PASSWORD_REQUIRED');
  }

  const result = await twoFactorService.disable2FA(req.user.userId, token, password);
  return sendSuccess(res, result, '2FA has been disabled.');
};

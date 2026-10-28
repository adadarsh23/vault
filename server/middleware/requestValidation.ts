import express from 'express';
import { AppError } from '../utils/appError.ts';

const USERNAME_PATTERN = /^[a-z0-9._-]+$/i;
const CAPTCHA_MIN_TOKEN_LENGTH = 20;
const CAPTCHA_MAX_TOKEN_LENGTH = 4096;

const ensureObjectBody = (value: unknown, message: string): Record<string, unknown> => {
  if (typeof value !== 'object' || value == null || Array.isArray(value)) {
    throw new AppError(400, 'INVALID_REQUEST_BODY', message);
  }

  return value as Record<string, unknown>;
};

const validateOptionalDeviceId = (value: unknown) => {
  if (value == null) {
    return;
  }

  if (typeof value !== 'string' || !value.trim() || value.trim().length > 128) {
    throw new AppError(
      400,
      'INVALID_DEVICE_ID',
      'Device identifier must be a non-empty string under 129 characters.',
    );
  }
};

export const validateAuthCredentials = (
  req: express.Request,
  _res: express.Response,
  next: express.NextFunction,
) => {
  try {
    const body = ensureObjectBody(req.body, 'Request body must be a JSON object.');

    const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
    if (
      !username ||
      username.length < 3 ||
      username.length > 64 ||
      !USERNAME_PATTERN.test(username)
    ) {
      throw new AppError(
        400,
        'INVALID_USERNAME',
        'Username must be 3 to 64 characters and use only letters, numbers, dots, underscores, or hyphens.',
      );
    }
    body.username = username;

    if (
      typeof body.password !== 'string' ||
      body.password.length < 16 ||
      body.password.length > 128
    ) {
      throw new AppError(
        400,
        'INVALID_PASSWORD',
        'Password must be between 16 and 128 characters.',
      );
    }

    validateOptionalDeviceId(body.deviceId);
    next();
  } catch (error) {
    next(error);
  }
};

export const validateRegistrationCredentials = (
  req: express.Request,
  _res: express.Response,
  next: express.NextFunction,
) => {
  try {
    const body = ensureObjectBody(req.body, 'Request body must be a JSON object.');

    const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
    if (
      !username ||
      username.length < 3 ||
      username.length > 64 ||
      !USERNAME_PATTERN.test(username)
    ) {
      throw new AppError(
        400,
        'INVALID_USERNAME',
        'Username must be 3 to 64 characters and use only letters, numbers, dots, underscores, or hyphens.',
      );
    }
    body.username = username;

    if (
      typeof body.password !== 'string' ||
      body.password.length < 16 ||
      body.password.length > 128
    ) {
      throw new AppError(
        400,
        'INVALID_PASSWORD',
        'Password must be between 16 and 128 characters.',
      );
    }

    if (
      typeof body.masterKey !== 'string' ||
      body.masterKey.length < 16 ||
      body.masterKey.length > 128
    ) {
      throw new AppError(
        400,
        'INVALID_MASTER_KEY',
        'Master Key must be between 16 and 128 characters.',
      );
    }

    validateOptionalDeviceId(body.deviceId);
    next();
  } catch (error) {
    next(error);
  }
};

export const validateChangePasswordRequest = (
  req: express.Request,
  _res: express.Response,
  next: express.NextFunction,
) => {
  try {
    const body = ensureObjectBody(req.body, 'Request body must be a JSON object.');

    if (
      typeof body.currentPassword !== 'string' ||
      body.currentPassword.length < 8 ||
      body.currentPassword.length > 128
    ) {
      throw new AppError(
        400,
        'INVALID_PASSWORD',
        'Current password must be between 8 and 128 characters.',
      );
    }

    if (
      typeof body.newPassword !== 'string' ||
      body.newPassword.length < 8 ||
      body.newPassword.length > 128
    ) {
      throw new AppError(
        400,
        'INVALID_PASSWORD',
        'New password must be between 8 and 128 characters.',
      );
    }

    next();
  } catch (error) {
    next(error);
  }
};

export const validateSessionRevokeRequest = (
  req: express.Request,
  _res: express.Response,
  next: express.NextFunction,
) => {
  try {
    const body = ensureObjectBody(req.body, 'Request body must be a JSON object.');
    const hasSessionId = typeof body.sessionId === 'string' && body.sessionId.trim().length > 0;
    const hasDeviceId = typeof body.deviceId === 'string' && body.deviceId.trim().length > 0;
    const revokeAllOther = body.revokeAllOther === true;
    const revokeCurrent = body.revokeCurrent === true;

    if (!hasSessionId && !hasDeviceId && !revokeAllOther) {
      throw new AppError(
        400,
        'SESSION_TARGET_REQUIRED',
        'Provide sessionId, deviceId, or revokeAllOther=true.',
      );
    }

    if (body.sessionId != null && !hasSessionId) {
      throw new AppError(
        400,
        'INVALID_SESSION_ID',
        'Session identifier must be a non-empty string.',
      );
    }

    if (body.deviceId != null) {
      validateOptionalDeviceId(body.deviceId);
    }

    if (revokeCurrent && !revokeAllOther) {
      throw new AppError(
        400,
        'INVALID_REVOKE_REQUEST',
        'revokeCurrent=true must be paired with revokeAllOther=true.',
      );
    }

    next();
  } catch (error) {
    next(error);
  }
};

export const validateContactRequest = (
  req: express.Request,
  _res: express.Response,
  next: express.NextFunction,
) => {
  try {
    const body = ensureObjectBody(req.body, 'Request body must be a JSON object.');

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name || name.length < 2 || name.length > 100) {
      throw new AppError(400, 'INVALID_NAME', 'Full name must be between 2 and 100 characters.');
    }
    body.name = name;

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!email || !emailRegex.test(email)) {
      throw new AppError(400, 'INVALID_EMAIL', 'A valid email address is required.');
    }
    body.email = email;

    const username = typeof body.username === 'string' ? body.username.trim() : '';
    if (
      !username ||
      username.length < 3 ||
      username.length > 64 ||
      !USERNAME_PATTERN.test(username)
    ) {
      throw new AppError(
        400,
        'INVALID_USERNAME',
        'Username must be 3 to 64 characters and use only letters, numbers, dots, underscores, or hyphens.',
      );
    }
    body.username = username;

    const subject = typeof body.subject === 'string' ? body.subject : '';
    const validSubjects = [
      'General Inquiry',
      'Technical Support',
      'Security Vulnerability',
      'Vault Access',
      'Feature Request',
      'Privacy Request',
      'Other',
    ];
    if (!validSubjects.includes(subject)) {
      throw new AppError(400, 'INVALID_SUBJECT', 'Please select a valid query category.');
    }

    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (!message || message.length < 10 || message.length > 2000) {
      throw new AppError(400, 'INVALID_MESSAGE', 'Message must be between 10 and 2000 characters.');
    }
    body.message = message;

    const captchaToken = typeof body.captchaToken === 'string' ? body.captchaToken.trim() : '';
    if (
      !captchaToken ||
      captchaToken.length < CAPTCHA_MIN_TOKEN_LENGTH ||
      captchaToken.length > CAPTCHA_MAX_TOKEN_LENGTH
    ) {
      throw new AppError(
        400,
        'CAPTCHA_TOKEN_MISSING',
        'Complete the CAPTCHA challenge before submitting.',
      );
    }

    next();
  } catch (error) {
    next(error);
  }
};

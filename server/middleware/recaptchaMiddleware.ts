import express from 'express';
import { AppError } from '../utils/appError.ts';
import { logger } from '../utils/logger.ts';
import { getClientIp } from '../utils/requestIp.ts';
import {
  isAllowedCaptchaHostname,
  readRecaptchaTokenFromBody,
  verifyRecaptchaToken,
} from '../services/recaptchaService.ts';

export type RecaptchaProtectedAction =
  | 'auth_login'
  | 'auth_register'
  | 'auth_2fa_login'
  | 'auth_cloud_unlock'
  | 'auth_change_password'
  | 'contact_submit'
  | 'master_key_change';

interface RequireRecaptchaOptions {
  action: RecaptchaProtectedAction;
  tokenField?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasTimeoutOrDuplicateCode = (errorCodes: string[]): boolean =>
  errorCodes.includes('timeout-or-duplicate');

export const requireRecaptcha = (options: RequireRecaptchaOptions) => {
  const tokenField = options.tokenField || 'captchaToken';

  return async (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    try {
      if (!isRecord(req.body)) {
        throw AppError.badRequest('Request body must be a JSON object.', 'INVALID_REQUEST_BODY');
      }

      const token = readRecaptchaTokenFromBody(req.body[tokenField]);
      const verification = await verifyRecaptchaToken({
        token,
        remoteIp: getClientIp(req),
      });

      // Always remove raw tokens from request body after verification.
      delete req.body[tokenField];

      if (!verification.success) {
        const code = hasTimeoutOrDuplicateCode(verification.errorCodes)
          ? 'CAPTCHA_TOKEN_EXPIRED'
          : 'CAPTCHA_VERIFICATION_FAILED';
        const message = hasTimeoutOrDuplicateCode(verification.errorCodes)
          ? 'CAPTCHA expired. Please complete it again.'
          : 'Security verification failed. Please retry the CAPTCHA challenge.';

        logger.warn('[SECURITY] reCAPTCHA verification failed.', {
          action: options.action,
          path: req.originalUrl,
          method: req.method,
          ipAddress: getClientIp(req),
          requestId: (req as express.Request & { requestId?: string }).requestId,
          hostname: verification.hostname,
          challengeTs: verification.challengeTs,
          errorCodes: verification.errorCodes,
          userId: (req as express.Request & { user?: { userId?: string } }).user?.userId,
        });

        throw AppError.forbidden(message, code);
      }

      if (!isAllowedCaptchaHostname(verification.hostname)) {
        logger.warn('[SECURITY] reCAPTCHA hostname mismatch detected.', {
          action: options.action,
          path: req.originalUrl,
          method: req.method,
          ipAddress: getClientIp(req),
          requestId: (req as express.Request & { requestId?: string }).requestId,
          hostname: verification.hostname,
          userId: (req as express.Request & { user?: { userId?: string } }).user?.userId,
        });

        throw AppError.forbidden(
          'Security verification failed for this origin.',
          'CAPTCHA_HOSTNAME_MISMATCH',
        );
      }

      // If the provider returns an action claim (v3/enterprise-style payloads),
      // ensure it matches the server-expected action for this route.
      if (verification.action && verification.action !== options.action) {
        logger.warn('[SECURITY] reCAPTCHA action mismatch detected.', {
          action: options.action,
          reportedAction: verification.action,
          path: req.originalUrl,
          method: req.method,
          ipAddress: getClientIp(req),
          requestId: (req as express.Request & { requestId?: string }).requestId,
          hostname: verification.hostname,
          userId: (req as express.Request & { user?: { userId?: string } }).user?.userId,
        });

        throw AppError.forbidden(
          'Security verification does not match this action.',
          'CAPTCHA_ACTION_MISMATCH',
        );
      }

      next();
    } catch (error) {
      const code = (error as { code?: unknown })?.code;
      if (typeof code === 'string' && code.startsWith('CAPTCHA_')) {
        logger.warn('[SECURITY] reCAPTCHA request rejected before verification.', {
          action: options.action,
          code,
          message: (error as { message?: string })?.message,
          path: req.originalUrl,
          method: req.method,
          ipAddress: getClientIp(req),
          requestId: (req as express.Request & { requestId?: string }).requestId,
          userId: (req as express.Request & { user?: { userId?: string } }).user?.userId,
        });
      }
      next(error);
    }
  };
};

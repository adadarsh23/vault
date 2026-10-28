import express from 'express';
import multer from 'multer';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { AppError } from '../utils/appError.ts';
import { logger } from '../utils/logger.ts';
import { getClientIp } from '../utils/requestIp.ts';
import { isAllowedCorsOrigin } from '../utils/cors.ts';
import { addBreadcrumb, captureException } from '../lib/sentry.js';

export const errorHandler = (
  err: any,
  req: express.Request,
  res: express.Response,
  _next: express.NextFunction,
) => {
  if (res.headersSent) {
    return _next(err);
  }

  const requestId = (req as express.Request & { requestId?: string }).requestId;

  // Handle CORS headers safely on error responses
  const rawOrigin = req.get('origin') || req.get('referer');
  if (rawOrigin) {
    try {
      const candidate = new URL(rawOrigin).origin;
      if (isAllowedCorsOrigin(candidate)) {
        res.setHeader('Access-Control-Allow-Origin', candidate);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      }
    } catch {
      // Ignore invalid URL parse attempts; do not attach wildcard ACAO
    }
  }

  // Normalize initial error values
  let statusCode =
    typeof err?.statusCode === 'number'
      ? err.statusCode
      : typeof err?.status === 'number'
        ? err.status
        : 500;
  let code = err?.code ? String(err.code) : 'INTERNAL_SERVER_ERROR';
  let message =
    typeof err?.message === 'string' && err.message.trim()
      ? err.message
      : 'An unexpected error occurred.';
  let details: any = undefined;
  let isOperational = Boolean(err?.isOperational);

  // Handle specific error types
  if (err instanceof SyntaxError && 'body' in err) {
    statusCode = 400;
    code = 'INVALID_JSON';
    message = 'Request body contains invalid JSON.';
    isOperational = true;
  } else if (err instanceof ZodError) {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = 'Input validation failed.';
    details = err.issues.map((e: any) => ({
      path: e.path.join('.'),
      message: e.message,
    }));
    isOperational = true;
  } else if (
    err instanceof mongoose.Error.CastError ||
    err?.name === 'BSONError' ||
    err?.name === 'BSONTypeError'
  ) {
    statusCode = 400;
    code = 'INVALID_ID';
    message =
      err instanceof mongoose.Error.CastError
        ? `Invalid format for field '${err.path}'.`
        : 'Invalid identifier format.';
    isOperational = true;
  } else if (err instanceof mongoose.Error.ValidationError) {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    const firstIssue = Object.values(err.errors)[0];
    message = firstIssue?.message || 'Validation failed.';
    isOperational = true;
  } else if (err?.name === 'TokenExpiredError') {
    statusCode = 401;
    code = 'TOKEN_EXPIRED';
    message = 'Authentication token has expired.';
    isOperational = true;
  } else if (err?.name === 'JsonWebTokenError') {
    statusCode = 401;
    code = 'INVALID_TOKEN';
    message = 'Authentication token is invalid.';
    isOperational = true;
  } else if (err?.type === 'entity.too.large' || statusCode === 413) {
    statusCode = 413;
    code = 'PAYLOAD_TOO_LARGE';
    message = 'Request payload exceeds maximum size limit.';
    isOperational = true;
  } else if (err?.code === 11000 || err?.code === '11000') {
    statusCode = 409;
    code = 'DUPLICATE_RESOURCE';
    message = 'The requested resource already exists.';
    isOperational = true;
  } else if (
    err?.code === 'EBADCSRFTOKEN' ||
    err?.code === 'CSRF_TOKEN_INVALID' ||
    err?.message === 'invalid csrf token' ||
    (statusCode === 403 &&
      typeof err?.message === 'string' &&
      err.message.toLowerCase().includes('csrf'))
  ) {
    statusCode = 403;
    code = 'CSRF_TOKEN_INVALID';
    message = 'Invalid or missing CSRF token.';
    isOperational = true;
  } else if (err?.name === 'UnauthorizedError' || err?.code === 'UNAUTHORIZED') {
    statusCode = 401;
    code = 'UNAUTHORIZED';
    message = err.message || 'Authentication failed.';
    isOperational = true;
  } else if (err?.message === 'Origin is not allowed by CORS.') {
    statusCode = 403;
    code = 'CORS_FORBIDDEN';
    message = 'Request origin is not allowed.';
    isOperational = true;
  } else if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      statusCode = 413;
      code = 'PAYLOAD_TOO_LARGE';
      message = 'Uploaded file exceeds the maximum allowed size limit.';
    } else {
      statusCode = 400;
      code = err.code;
      message = err.message;
    }
    isOperational = true;
  } else if (
    err?.name === 'MongoServerSelectionError' ||
    err?.name === 'MongooseServerSelectionError' ||
    err?.name === 'MongoClientClosedError' ||
    err?.name === 'MongoNetworkError' ||
    err?.name === 'MongoTimeoutError' ||
    (typeof err?.message === 'string' &&
      (err.message.includes('client was closed') ||
        err.message.includes('connection <monitor> closed') ||
        err.message.includes('server selection') ||
        err.message.includes('buffering timed out')))
  ) {
    statusCode = 503;
    code = 'DB_UNAVAILABLE';
    message = 'Vault database is temporarily unavailable or reconnecting.';
    isOperational = true;
  } else if (err instanceof AppError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
    isOperational = true;
    if ((err as { details?: unknown }).details) {
      details = (err as { details?: unknown }).details;
    }
  }

  // Security Hardening: In production, never expose internal 500 error messages or paths to clients
  const isProduction = process.env.NODE_ENV === 'production';
  const clientFacingMessage =
    isProduction && statusCode >= 500 && !isOperational
      ? 'An unexpected server error occurred.'
      : message;

  // Log error with breadcrumbs and Sentry
  addBreadcrumb({
    category: 'error',
    message: clientFacingMessage,
    level: statusCode >= 500 ? 'error' : 'warning',
    data: {
      statusCode,
      code,
      path: req.originalUrl,
      method: req.method,
      requestId,
    },
  });

  captureException(err, {
    tags: {
      statusCode: String(statusCode),
      code,
      route: req.route?.path || req.originalUrl,
      method: req.method,
    },
    level: statusCode >= 500 ? 'error' : 'warning',
    extra: {
      requestId,
      details,
      isOperational,
    },
  });

  const isClientError = statusCode >= 400 && statusCode < 500;
  if (!isOperational && (statusCode >= 500 || !isClientError)) {
    logger.error('Unhandled or non-operational server error.', {
      requestId,
      method: req.method,
      path: req.originalUrl,
      error: {
        name: err?.name || 'Error',
        message: err?.message || String(err),
        stack: isProduction ? undefined : err?.stack,
      },
      ipAddress: getClientIp(req),
    });
  } else {
    logger.warn(`Operational error: ${message}`, {
      requestId,
      statusCode,
      code,
      path: req.originalUrl,
    });
  }

  // Consistent API response format
  return res.status(statusCode).json({
    success: false,
    message: clientFacingMessage,
    error: {
      code,
      requestId,
      ...(!isProduction && err?.stack ? { stack: err.stack } : {}),
      ...(details ? { details } : {}),
    },
  });
};

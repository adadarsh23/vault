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

  // Ensure cross-origin resources can see the error response
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

  const rawOrigin = req.get('origin') || req.get('referer');
  if (rawOrigin) {
    try {
      const candidate = new URL(rawOrigin).origin;
      if (isAllowedCorsOrigin(candidate)) {
        res.setHeader('Access-Control-Allow-Origin', candidate);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
      } else {
        res.setHeader('Access-Control-Allow-Origin', '*');
      }
    } catch {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }

  // Default values
  let statusCode = err.statusCode || err.status || 500;
  let code = err.code || 'INTERNAL_SERVER_ERROR';
  let message = err.message || 'An unexpected error occurred.';
  let details: any = undefined;

  // Handle specific error types
  if (err instanceof SyntaxError && 'body' in err) {
    statusCode = 400;
    code = 'INVALID_JSON';
    message = 'Request body contains invalid JSON.';
  } else if (err instanceof ZodError) {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = 'Input validation failed.';
    details = err.issues.map((e: any) => ({
      path: e.path.join('.'),
      message: e.message,
    }));
  } else if (err instanceof mongoose.Error.CastError) {
    statusCode = 400;
    code = 'INVALID_ID';
    message = `Invalid format for field '${err.path}'.`;
  } else if (err instanceof mongoose.Error.ValidationError) {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    const firstIssue = Object.values(err.errors)[0];
    message = firstIssue?.message || 'Validation failed.';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    code = 'TOKEN_EXPIRED';
    message = 'Authentication token has expired.';
  } else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    code = 'INVALID_TOKEN';
    message = 'Authentication token is invalid.';
  } else if (err.type === 'entity.too.large' || err.status === 413) {
    statusCode = 413;
    code = 'PAYLOAD_TOO_LARGE';
    message = 'Request payload exceeds maximum size limit.';
  } else if (err.code === 11000) {
    statusCode = 409;
    code = 'DUPLICATE_RESOURCE';
    message = 'The requested resource already exists.';
  } else if (
    err?.code === 'EBADCSRFTOKEN' ||
    err?.code === 'CSRF_TOKEN_INVALID' ||
    err?.message === 'invalid csrf token' ||
    (err?.status === 403 &&
      typeof err?.message === 'string' &&
      err.message.toLowerCase().includes('csrf'))
  ) {
    statusCode = 403;
    code = 'CSRF_TOKEN_INVALID';
    message = 'Invalid or missing CSRF token.';
  } else if (err.name === 'UnauthorizedError' || err.code === 'UNAUTHORIZED') {
    statusCode = 401;
    code = 'UNAUTHORIZED';
    message = err.message || 'Authentication failed.';
  } else if (err.message === 'Origin is not allowed by CORS.') {
    statusCode = 403;
    code = 'CORS_FORBIDDEN';
    message = 'Request origin is not allowed.';
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
  } else if (err instanceof AppError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
    if ((err as { details?: unknown }).details) {
      details = (err as { details?: unknown }).details;
    }
  }

  // Log error (only critical/unexpected or detailed for debugging)
  addBreadcrumb({
    category: 'error',
    message: message,
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
      isOperational: Boolean(err?.isOperational),
    },
  });

  // Log error (only critical/unexpected or detailed for debugging)
  const isClientError = statusCode >= 400 && statusCode < 500;
  if (statusCode >= 500 || (!err.isOperational && !isClientError)) {
    logger.error('Unhandled or non-operational server error.', {
      requestId,
      method: req.method,
      path: req.originalUrl,
      error: {
        name: err.name,
        message: err.message,
        stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
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

  // Response format
  return res.status(statusCode).json({
    success: false,
    message,
    error: {
      code,
      requestId,
      ...(process.env.NODE_ENV !== 'production' ? { stack: err.stack } : {}),
      ...(details ? { details } : {}),
    },
  });
};

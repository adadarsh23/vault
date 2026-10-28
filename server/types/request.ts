/**
 * Express Request and Handler Types
 */

import type express from 'express';
import type { AuthenticatedUser } from './auth.ts';
import type { SecurityContext } from './security.ts';

/**
 * Standard request enriched with tracing and correlation context
 */
export type RequestWithContext<
  P = any,
  ResBody = any,
  ReqBody = any,
  ReqQuery = any,
  Locals extends Record<string, any> = Record<string, any>,
> = express.Request<P, ResBody, ReqBody, ReqQuery, Locals> & {
  requestId?: string;
  clientIp?: string;
  startTime?: number;
  correlationId?: string;
};

/**
 * Strongly-typed authenticated request guaranteed to possess a verified user
 */
export type AuthenticatedRequest<
  P = any,
  ResBody = any,
  ReqBody = any,
  ReqQuery = any,
  Locals extends Record<string, any> = Record<string, any>,
> = RequestWithContext<P, ResBody, ReqBody, ReqQuery, Locals> & {
  user: AuthenticatedUser;
};

/**
 * Request with optional user identity (from resolveIdentity)
 */
export type OptionalAuthRequest<
  P = any,
  ResBody = any,
  ReqBody = any,
  ReqQuery = any,
  Locals extends Record<string, any> = Record<string, any>,
> = RequestWithContext<P, ResBody, ReqBody, ReqQuery, Locals> & {
  user?: AuthenticatedUser;
};

/**
 * Request enriched with full security and anomaly analysis
 */
export type RequestWithSecurity<
  P = any,
  ResBody = any,
  ReqBody = any,
  ReqQuery = any,
  Locals extends Record<string, any> = Record<string, any>,
> = RequestWithContext<P, ResBody, ReqBody, ReqQuery, Locals> & {
  security?: SecurityContext;
  user?: AuthenticatedUser;
  files?: any;
  file?: any;
};

/**
 * File upload request containing single or multiple files
 */
export type FileUploadRequest<
  P = any,
  ResBody = any,
  ReqBody = any,
  ReqQuery = any,
  Locals extends Record<string, any> = Record<string, any>,
> = AuthenticatedRequest<P, ResBody, ReqBody, ReqQuery, Locals> & {
  file?: Express.Multer.File;
  files?: Express.Multer.File[] | Record<string, Express.Multer.File[]>;
};

/**
 * Type-safe async express route handler
 */
export type AsyncRequestHandler<P = any, ResBody = any, ReqBody = any, ReqQuery = any> = (
  req: express.Request<P, ResBody, ReqBody, ReqQuery>,
  res: express.Response<ResBody>,
  next: express.NextFunction,
) => Promise<unknown> | unknown;

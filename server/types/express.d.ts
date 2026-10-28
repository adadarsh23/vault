/**
 * Express Global Namespace Augmentation
 *
 * Enriches standard Express Request and Response types across the server.
 */

import type { AuthenticatedUser } from './auth.ts';
import type { SecurityContext } from './security.ts';

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      user?: AuthenticatedUser;
      security?: SecurityContext;
      clientIp?: string;
      startTime?: number;
      correlationId?: string;
    }
  }
}

export {};

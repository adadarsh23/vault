import { Request, Response, NextFunction } from 'express';

/**
 * Custom NoSQL injection protection middleware
 * Express 5 compatible (handles read-only query property)
 */
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

export const customMongoSanitize = (req: Request, _res: Response, next: NextFunction) => {
  const sanitize = (obj: any, seen = new WeakSet()): void => {
    if (!obj || typeof obj !== 'object' || Buffer.isBuffer(obj)) {
      return;
    }

    if (seen.has(obj)) {
      return;
    }
    seen.add(obj);

    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        sanitize(obj[i], seen);
      }
      return;
    }

    for (const key of Object.getOwnPropertyNames(obj)) {
      if (key.startsWith('$') || key.includes('.') || FORBIDDEN_KEYS.has(key)) {
        delete obj[key];
      } else {
        sanitize(obj[key], seen);
      }
    }
  };

  if (req.body) sanitize(req.body);
  if (req.params) sanitize(req.params);

  try {
    if (req.query) sanitize(req.query);
  } catch {
    // If req.query is a read-only getter in Express 5, handle gracefully
  }

  next();
};

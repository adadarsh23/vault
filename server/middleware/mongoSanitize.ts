import { Request, Response, NextFunction } from 'express';

/**
 * Custom NoSQL injection protection middleware
 * Express 5 compatible (handles read-only query property safely)
 */
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

const isDangerousKey = (key: string): boolean =>
  key.startsWith('$') || key.includes('.') || FORBIDDEN_KEYS.has(key);

const sanitizeObject = (obj: any, seen = new WeakSet()): void => {
  if (
    !obj ||
    typeof obj !== 'object' ||
    Buffer.isBuffer(obj) ||
    obj instanceof Date ||
    obj instanceof RegExp
  ) {
    return;
  }

  if (seen.has(obj)) {
    return;
  }
  seen.add(obj);

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      try {
        sanitizeObject(obj[i], seen);
      } catch {
        // Ignore errors on inaccessible elements
      }
    }
    return;
  }

  let propertyNames: string[];
  try {
    propertyNames = Object.getOwnPropertyNames(obj);
  } catch {
    return;
  }

  for (const key of propertyNames) {
    if (isDangerousKey(key)) {
      try {
        delete obj[key];
      } catch {
        try {
          obj[key] = undefined;
        } catch {
          // Ignore if descriptor prevents modification
        }
      }
    } else {
      try {
        sanitizeObject(obj[key], seen);
      } catch {
        // Prevent accessor/getter exceptions from failing the sanitize cycle
      }
    }
  }
};

export const customMongoSanitize = (req: Request, _res: Response, next: NextFunction) => {
  try {
    if (req.body) {
      sanitizeObject(req.body);
    }
    if (req.params) {
      sanitizeObject(req.params);
    }
    if (req.query) {
      try {
        sanitizeObject(req.query);
      } catch {
        // Express 5 query getter can be protected or immutable in certain contexts
      }
    }
    next();
  } catch {
    next();
  }
};

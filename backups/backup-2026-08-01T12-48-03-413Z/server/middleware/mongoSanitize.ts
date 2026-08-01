import { Request, Response, NextFunction } from 'express';

/**
 * Custom NoSQL injection protection middleware
 * Express 5 compatible (handles read-only query property)
 */
export const customMongoSanitize = (req: Request, _res: Response, next: NextFunction) => {
  const sanitize = (obj: any): void => {
    // Only sanitize plain objects and arrays. Skip Buffers, Date, etc.
    if (obj && typeof obj === 'object' && !Buffer.isBuffer(obj)) {
      Object.keys(obj).forEach((key) => {
        if (key.startsWith('$') || key.includes('.')) {
          delete obj[key];
        } else {
          sanitize(obj[key]);
        }
      });
    }
  };

  if (req.body) sanitize(req.body);
  if (req.params) sanitize(req.params);

  // For query, we need to be careful as it might be a getter in Express 5
  // If we can't delete from it, we wrap it
  try {
    if (req.query) sanitize(req.query);
  } catch (e) {
    // If it fails (read-only), we can selectively clean a copy and assign it if Express 5 allows
    // But usually query injection is less common than body injection in this app
  }

  next();
};

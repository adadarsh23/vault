import { Request, Response, NextFunction } from 'express';
import { ZodTypeAny } from 'zod';

export type ValidationTarget = 'body' | 'query' | 'params';

/**
 * Middleware to validate request body, queries, or params using Zod schemas.
 * Defaults to validating `req.body`.
 */
export const validate = (schema: ZodTypeAny, target: ValidationTarget = 'body') => {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const dataToValidate = req[target] ?? {};
      const parsed = await schema.parseAsync(dataToValidate);

      if (target === 'body') {
        req.body = parsed;
      } else if (target === 'params') {
        req.params = parsed as any;
      } else if (target === 'query') {
        try {
          req.query = parsed as any;
        } catch {
          // Express 5 req.query may be a getter
          if (req.query && typeof req.query === 'object') {
            Object.assign(req.query, parsed);
          }
        }
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
};

import { Request, Response, NextFunction } from 'express';
import { ZodError, ZodTypeAny } from 'zod';

/**
 * Middleware to validate request body, queries, or params using Zod
 */
export const validate = (schema: ZodTypeAny) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    schema
      .parseAsync(req.body)
      .then((parsed) => {
        req.body = parsed;
        next();
      })
      .catch((error: ZodError | Error) => next(error));
  };
};

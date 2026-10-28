import express from 'express';
import { validationResult, type ValidationChain } from 'express-validator';
import { AppError } from '../utils/appError.ts';

type ValidationIssue = {
  path: string;
  message: string;
};

/**
 * Runs express-validator chains and forwards a normalized AppError when input is invalid.
 */
export const validateRequest = (validations: ValidationChain[]) => {
  return async (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    try {
      if (!Array.isArray(validations) || validations.length === 0) {
        return next();
      }

      await Promise.all(validations.map((validation) => validation.run(req)));

      const result = validationResult(req);
      if (result.isEmpty()) {
        return next();
      }

      const details: ValidationIssue[] = result.array({ onlyFirstError: true }).map((rawError) => {
        const error = rawError as unknown as { path?: unknown; param?: unknown; msg?: unknown };
        const fieldPath =
          typeof error.path === 'string'
            ? error.path
            : typeof error.param === 'string'
              ? error.param
              : 'request';
        const message = typeof error.msg === 'string' ? error.msg : 'Invalid input.';

        return { path: fieldPath, message };
      });

      const validationError = AppError.badRequest(
        'Input validation failed.',
        'VALIDATION_ERROR',
      ) as AppError & { details?: ValidationIssue[] };
      validationError.details = details;

      return next(validationError);
    } catch (error) {
      return next(error);
    }
  };
};

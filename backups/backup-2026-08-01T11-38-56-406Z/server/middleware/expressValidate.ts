import express from "express";
import { validationResult, type ValidationChain } from "express-validator";
import { AppError } from "../utils/appError.ts";

type ValidationIssue = {
  path: string;
  message: string;
};

/**
 * Runs express-validator chains and forwards a normalized AppError when input is invalid.
 */
export const validateRequest = (validations: ValidationChain[]) => {
  return async (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ) => {
    await Promise.all(validations.map((validation) => validation.run(req)));

    const result = validationResult(req);
    if (result.isEmpty()) {
      return next();
    }

    const details: ValidationIssue[] = result.array({ onlyFirstError: true }).map((error) => {
      const fieldPath =
        typeof (error as { path?: unknown }).path === "string"
          ? (error as { path: string }).path
          : "request";
      const message =
        typeof (error as { msg?: unknown }).msg === "string"
          ? (error as { msg: string }).msg
          : "Invalid input.";

      return { path: fieldPath, message };
    });

    const validationError = AppError.badRequest(
      "Input validation failed.",
      "VALIDATION_ERROR",
    ) as AppError & { details?: ValidationIssue[] };
    validationError.details = details;

    return next(validationError);
  };
};


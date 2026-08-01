import express from "express";

export const asyncHandler = (
  handler: (req: any, res: express.Response, next: express.NextFunction) => Promise<unknown>,
): express.RequestHandler => {
  return (req, res, next) => {
    void Promise.resolve(handler(req, res, next)).catch(next);
  };
};

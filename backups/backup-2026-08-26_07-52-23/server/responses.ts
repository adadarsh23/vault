import express from 'express';

/**
 * Sends a standardized success response.
 */
export const sendSuccess = <T>(
  res: express.Response,
  data: T,
  message = 'Operation successful',
  status = 200,
) => {
  return res.status(status).json({
    success: true,
    message,
    data,
  });
};

/**
 * DEPRECATED: Use throw new AppError() instead.
 * Kept for backward compatibility during transition.
 */
export const sendRequestError = (
  req: express.Request,
  res: express.Response,
  status: number,
  error: { code: string; message: string },
) => {
  const requestId = (req as any).requestId;
  return res.status(status).json({
    success: false,
    message: error.message,
    error: {
      code: error.code,
      requestId,
    },
  });
};

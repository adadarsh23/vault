import type express from 'express';
import type { ApiSuccessResponse, ApiErrorResponse, RequestWithContext } from './types/index.ts';

/**
 * Sends a standardized success response.
 */
export const sendSuccess = <T>(
  res: express.Response,
  data: T,
  message = 'Operation successful',
  status = 200,
): express.Response<ApiSuccessResponse<T>> => {
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
  req: express.Request | RequestWithContext,
  res: express.Response,
  status: number,
  error: { code: string; message: string },
): express.Response<ApiErrorResponse> => {
  const requestId = (req as RequestWithContext).requestId;
  return res.status(status).json({
    success: false,
    message: error.message,
    error: {
      code: error.code,
      requestId,
    },
  });
};

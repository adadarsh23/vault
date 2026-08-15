/**
 * Custom Error class for operational errors that we can predict and handle.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Factory method for Bad Request (400)
   */
  static badRequest(message: string, code = 'BAD_REQUEST') {
    return new AppError(400, code, message);
  }

  /**
   * Factory method for Unauthorized (401)
   */
  static unauthorized(message: string, code = 'UNAUTHORIZED') {
    return new AppError(401, code, message);
  }

  /**
   * Factory method for Forbidden (403)
   */
  static forbidden(message: string, code = 'FORBIDDEN') {
    return new AppError(403, code, message);
  }

  /**
   * Factory method for Not Found (404)
   */
  static notFound(message: string, code = 'NOT_FOUND') {
    return new AppError(404, code, message);
  }

  /**
   * Factory method for Conflict (409)
   */
  static conflict(message: string, code = 'CONFLICT') {
    return new AppError(409, code, message);
  }

  /**
   * Factory method for Internal Server Error (500)
   */
  static internal(message: string, code = 'INTERNAL_ERROR') {
    return new AppError(500, code, message);
  }
}

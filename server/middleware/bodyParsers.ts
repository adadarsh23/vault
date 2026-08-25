import express from 'express';
import { AppError } from '../utils/appError.ts';
import { logger } from '../utils/logger.ts';

const JSON_LIMIT = `${Math.max(1, Number.parseInt(process.env.MAX_JSON_BODY_MB || '100', 10))}mb`;
const jsonParser = express.json({ limit: JSON_LIMIT });
const urlencodedParser = express.urlencoded({
  limit: JSON_LIMIT,
  extended: true,
  parameterLimit: 100,
});

export const installBodyParsers = (app: express.Express): void => {
  app.use((req, res, next) => {
    jsonParser(req, res, (err) => {
      if (err) {
        const status =
          typeof (err as { status?: unknown }).status === 'number'
            ? (err as { status: number }).status
            : 400;
        const isTooLarge =
          status === 413 || (err as Error).message.toLowerCase().includes('too large');

        logger.warn('Request body parsing failed.', {
          method: req.method,
          path: req.originalUrl,
          requestId: (req as express.Request & { requestId?: string }).requestId,
          status,
          error: err,
        });

        // Pass to the global error handler
        return next(
          new AppError(
            isTooLarge ? 413 : 400,
            isTooLarge ? 'PAYLOAD_TOO_LARGE' : 'INVALID_JSON',
            isTooLarge
              ? 'Request payload exceeded the server limit.'
              : 'Request body contains invalid JSON.',
          ),
        );
      }
      next();
    });
  });

  app.use(urlencodedParser);
};

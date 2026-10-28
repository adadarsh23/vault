import express from 'express';
import { AppError } from '../utils/appError.ts';
import { logger } from '../utils/logger.ts';

const parseBodyLimit = (): string => {
  const parsed = Number.parseInt(process.env.MAX_JSON_BODY_MB || '100', 10);
  const mb = Number.isFinite(parsed) && parsed > 0 ? parsed : 100;
  return `${mb}mb`;
};

const BODY_LIMIT = parseBodyLimit();
const jsonParser = express.json({ limit: BODY_LIMIT });
const urlencodedParser = express.urlencoded({
  limit: BODY_LIMIT,
  extended: true,
  parameterLimit: 100,
});

const handleBodyParseError = (
  err: any,
  req: express.Request,
  parserType: 'json' | 'urlencoded',
  next: express.NextFunction,
) => {
  const status =
    typeof (err as { status?: unknown })?.status === 'number'
      ? (err as { status: number }).status
      : 400;
  const isTooLarge =
    status === 413 ||
    (err as Error)?.message?.toLowerCase()?.includes('too large') ||
    (err as { type?: string })?.type === 'entity.too.large';

  const requestId = (req as express.Request & { requestId?: string }).requestId;

  logger.warn(`Request ${parserType} body parsing failed.`, {
    method: req.method,
    path: req.originalUrl,
    requestId,
    status,
    parserType,
    error: err instanceof Error ? err.message : String(err),
  });

  return next(
    new AppError(
      isTooLarge ? 413 : 400,
      isTooLarge ? 'PAYLOAD_TOO_LARGE' : 'INVALID_JSON',
      isTooLarge
        ? 'Request payload exceeded the server limit.'
        : `Request body contains invalid ${parserType === 'json' ? 'JSON' : 'form encoding'}.`,
    ),
  );
};

export const installBodyParsers = (app: express.Express): void => {
  // JSON Body Parser
  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (res.headersSent) {
      return next();
    }
    jsonParser(req, res, (err: any) => {
      if (err) {
        return handleBodyParseError(err, req, 'json', next);
      }
      next();
    });
  });

  // URL-encoded Form Body Parser
  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (res.headersSent) {
      return next();
    }
    urlencodedParser(req, res, (err: any) => {
      if (err) {
        return handleBodyParseError(err, req, 'urlencoded', next);
      }
      next();
    });
  });
};

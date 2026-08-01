import express from 'express';
import { randomUUID } from 'crypto';
import { authRouter } from '../../server/routes/authRoutes.ts';
import { installBodyParsers } from '../../server/middleware/bodyParsers.ts';
import { installCsrfProtection } from '../../server/middleware/csrfProtection.ts';
import { errorHandler } from '../../server/middleware/errorHandler.ts';

type CreateAuthTestAppOptions = {
  enableCsrf?: boolean;
};

export const createAuthTestApp = (options: CreateAuthTestAppOptions = {}) => {
  const app = express();

  // Attach a requestId to every request so error responses can include it.
  // NOTE: `next` must be called to continue the middleware chain.
  app.use((req, _res, next) => {
    (req as express.Request & { requestId?: string }).requestId = randomUUID();
    next();
  });

  installBodyParsers(app);
  if (options.enableCsrf) {
    installCsrfProtection(app);
  }
  app.use('/api/auth', authRouter);
  app.use(errorHandler);

  return app;
};

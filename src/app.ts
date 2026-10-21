import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';

import { env } from './config/env.js';
import { httpLogger, logger } from './lib/logger.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import { errorHandler } from './middleware/error-handler.js';
import { createApiRouter } from './routes/index.js';

export const createApp = (): Express => {
  const app = express();

  app.set('trust proxy', env.TRUST_PROXY);

  // Middleware order per TRD §3:
  // 1. requestId
  app.use(requestIdMiddleware());
  // 2. helmet
  app.use(helmet());
  // 3. cors (allowlist = FRONTEND_URL, credentials: true)
  app.use(
    cors({
      origin: new URL(env.FRONTEND_URL).origin,
      credentials: true,
    }),
  );
  // 4. express.json + cookieParser
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  // 5. Pino HTTP logger
  app.use(httpLogger);
  // 6-9 are applied per-route in createApiRouter
  app.use('/api/v1', createApiRouter());

  // 404 handler
  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Not found' },
    });
  });

  // 10. Central error handler
  app.use(errorHandler);

  return app;
};

export { logger };

import express, { type Express } from 'express';

import { env } from './config/env.js';
import { httpLogger } from './lib/logger.js';
import { createApiRouter } from './routes/index.js';

export const createApp = (): Express => {
  const app = express();

  app.set('trust proxy', env.TRUST_PROXY);
  app.use(httpLogger);
  app.use(express.json({ limit: '100kb' }));
  app.use('/api/v1', createApiRouter());

  return app;
};

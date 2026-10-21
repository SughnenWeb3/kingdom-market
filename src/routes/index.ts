import { Router } from 'express';

import { getLiveStatus, getReadyStatus } from '../modules/health/health.service.js';

export const createApiRouter = (): Router => {
  const router = Router();

  router.get('/health/live', (_request, response) => {
    response.status(200).json(getLiveStatus());
  });

  router.get('/health/ready', async (_request, response) => {
    const result = await getReadyStatus();
    response.status(result.status === 'ready' ? 200 : 503).json(result);
  });

  return router;
};

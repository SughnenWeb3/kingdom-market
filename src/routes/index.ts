import { Router } from 'express';

import { getLiveStatus, getReadyStatus } from '../modules/health/health.service.js';

export const createApiRouter = (): Router => {
  const router = Router();

  router.get('/health/live', (_request, response) => {
    response.status(200).json(getLiveStatus());
  });

  router.get('/health/ready', (_request, response) => {
    response.status(200).json(getReadyStatus());
  });

  return router;
};

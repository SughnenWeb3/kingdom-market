import { Router } from 'express';

import { getLiveStatus, getReadyStatus } from '../modules/health/health.service.js';
import { loadSession } from '../middleware/authenticate.js';
import { csrfMiddleware } from '../middleware/csrf.js';
import { createAuthRouter } from '../modules/auth/auth.routes.js';

export const createApiRouter = (): Router => {
  const router = Router();

  // Health endpoints (no auth, no CSRF)
  router.get('/health/live', (_request, response) => {
    response.status(200).json(getLiveStatus());
  });

  router.get('/health/ready', async (_request, response) => {
    const result = await getReadyStatus();
    response.status(result.status === 'ready' ? 200 : 503).json(result);
  });

  // Auth routes (public + authenticated, with rate limits and CSRF)
  // loadSession attaches req.auth if a valid session exists (optional for public routes).
  // csrfMiddleware checks Origin on state-changing requests and CSRF token for authenticated ones.
  router.use('/auth', loadSession, csrfMiddleware, createAuthRouter());

  return router;
};

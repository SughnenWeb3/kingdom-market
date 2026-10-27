import { Router } from 'express';

import { loginLimiter, registerLimiter, googleStartLimiter } from '../../middleware/rate-limit.js';
import { loadSession, requireAuth } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';

import { registerSchema, loginSchema } from './auth.schema.js';
import {
  register,
  login,
  logout,
  me,
  googleAuth,
  googleCallback,
} from './auth.controller.js';

export const createAuthRouter = (): Router => {
  const router = Router();

  // Public routes (rate-limited, CSRF origin-checked by global middleware)
  router.post('/register', register);
  router.post('/login', loginLimiter, validate(loginSchema), login);

  // Google OIDC flow
  router.get('/google', googleStartLimiter, googleAuth);
  router.get('/google/callback', googleStartLimiter, googleCallback);

  // Authenticated routes
  router.post('/logout', requireAuth, logout);
  router.get('/me', requireAuth, me);

  return router;
};

// Export loadSession so the router index can include it in the global middleware chain.
export { loadSession };

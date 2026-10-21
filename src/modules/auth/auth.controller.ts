import type { Request, Response } from 'express';

import { env } from '../../config/env.js';
import { success } from '../../lib/response.js';
import { AppError } from '../../lib/errors.js';
import { sessionCookieOptions } from '../../lib/session.js';

import {
  register as registerService,
  login as loginService,
  logout as logoutService,
  getMe as getMeService,
  startGoogleAuth,
  completeGoogleAuth,
} from './auth.service.js';

// ── Helpers ──────────────────────────────────────────────────────

const setSessionCookie = (res: Response, token: string): void => {
  res.cookie(env.SESSION_COOKIE_NAME, token, sessionCookieOptions);
};

const clearSessionCookie = (res: Response): void => {
  res.clearCookie(env.SESSION_COOKIE_NAME, { path: '/' });
};

// ── POST /auth/register ───────────────────────────────────────────

export const register = async (req: Request, res: Response): Promise<void> => {
  const { email, password, displayName } = req.body as {
    email: string;
    password: string;
    displayName?: string;
  };

  const result = await registerService(email, password, displayName);

  setSessionCookie(res, result.token);

  success(res, 201, { user: result.user, csrfToken: result.csrfToken });
};

// ── POST /auth/login ──────────────────────────────────────────────

export const login = async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body as { email: string; password: string };

  const result = await loginService(email, password);

  setSessionCookie(res, result.token);

  success(res, 200, { user: result.user, csrfToken: result.csrfToken });
};

// ── POST /auth/logout ─────────────────────────────────────────────

export const logout = async (req: Request, res: Response): Promise<void> => {
  if (!req.auth) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
  }

  await logoutService(req.auth.sessionId);
  clearSessionCookie(res);

  res.status(204).send();
};

// ── GET /auth/me ──────────────────────────────────────────────────

export const me = async (req: Request, res: Response): Promise<void> => {
  if (!req.auth || !req.sessionTokenHash) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
  }

  const result = await getMeService(req.auth.userId, req.sessionTokenHash);

  success(res, 200, { user: result.user, csrfToken: result.csrfToken });
};

// ── GET /auth/google ──────────────────────────────────────────────

export const googleAuth = async (req: Request, res: Response): Promise<void> => {
  const params = await startGoogleAuth();

  // Store state, nonce, and code_verifier in a short-lived signed HttpOnly cookie.
  // 10 minute max-age, cleared on callback.
  const flowData = {
    state: params.state,
    nonce: params.nonce,
    codeVerifier: params.codeVerifier,
  };

  res.cookie('km_google_flow', JSON.stringify(flowData), {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 10 * 60 * 1000, // 10 minutes
  });

  res.redirect(302, params.authorizationUrl);
};

// ── GET /auth/google/callback ─────────────────────────────────────

export const googleCallback = async (req: Request, res: Response): Promise<void> => {
  // Retrieve flow data from cookie.
  const flowCookie = req.cookies?.['km_google_flow'] as string | undefined;

  if (!flowCookie) {
    res.redirect(302, `${env.FRONTEND_URL}/auth/error?code=CSRF_INVALID`);
    return;
  }

  let checks: { state: string; nonce: string; codeVerifier: string };
  try {
    checks = JSON.parse(flowCookie) as typeof checks;
  } catch {
    res.redirect(302, `${env.FRONTEND_URL}/auth/error?code=VALIDATION_ERROR`);
    return;
  }

  // Clear the flow cookie immediately.
  res.clearCookie('km_google_flow', { path: '/' });

  // Reconstruct the callback URL for openid-client.
  const callbackUrl = `${req.originalUrl}`;

  try {
    const result = await completeGoogleAuth(callbackUrl, checks);

    setSessionCookie(res, result.token);

    res.redirect(302, env.FRONTEND_URL);
  } catch (error) {
    if (error instanceof AppError) {
      res.redirect(302, `${env.FRONTEND_URL}/auth/error?code=${error.code}`);
    } else {
      res.redirect(302, `${env.FRONTEND_URL}/auth/error?code=INTERNAL`);
    }
  }
};

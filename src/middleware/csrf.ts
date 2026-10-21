import type { RequestHandler } from 'express';

import { env } from '../config/env.js';
import { AppError } from '../lib/errors.js';
import { verifyCsrfToken } from '../lib/csrf.js';

const STATE_CHANGING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

// CSRF middleware: applies to state-changing requests only.
// 1. Origin check: Origin (or Referer fallback) must match FRONTEND_URL's origin.
// 2. Token check (authenticated requests): X-CSRF-Token header must match
//    HMAC-SHA256(CSRF_SECRET, sessionTokenHash), compared with timingSafeEqual.
//
// Unauthenticated POSTs (register, login) are covered by the Origin check and rate limits.
export const csrfMiddleware: RequestHandler = (req, _res, next) => {
  if (!STATE_CHANGING_METHODS.has(req.method)) {
    next();
    return;
  }

  // 1. Origin check
  const origin = req.headers.origin ?? req.headers.referer;
  if (!origin) {
    next(new AppError(403, 'CSRF_INVALID', 'Missing Origin or Referer header'));
    return;
  }

  let expectedOrigin: string;
  try {
    expectedOrigin = new URL(env.FRONTEND_URL).origin;
  } catch {
    next(new AppError(500, 'INTERNAL', 'Invalid FRONTEND_URL configuration'));
    return;
  }

  let requestOrigin: string;
  try {
    requestOrigin = new URL(origin).origin;
  } catch {
    next(new AppError(403, 'CSRF_INVALID', 'Invalid Origin or Referer header'));
    return;
  }

  if (requestOrigin !== expectedOrigin) {
    next(new AppError(403, 'CSRF_INVALID', 'Origin does not match allowed frontend URL'));
    return;
  }

  // 2. Token check for authenticated requests
  if (req.auth && req.sessionTokenHash) {
    const csrfToken = req.headers['x-csrf-token'] as string | undefined;

    if (!csrfToken) {
      next(new AppError(403, 'CSRF_INVALID', 'Missing CSRF token'));
      return;
    }

    if (!verifyCsrfToken(csrfToken, req.sessionTokenHash)) {
      next(new AppError(403, 'CSRF_INVALID', 'Invalid CSRF token'));
      return;
    }
  }

  next();
};

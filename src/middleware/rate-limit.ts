import rateLimit from 'express-rate-limit';
import type { RequestHandler } from 'express';

import { AppError } from '../lib/errors.js';

// Standard error handler for rate limit responses.
// Uses the AppError envelope instead of express-rate-limit's default.
const rateLimitHandler: RequestHandler = (_req, res, _next) => {
  const error = new AppError(429, 'RATE_LIMITED', 'Too many requests, please try again later');
  res.status(error.status).json({
    success: false,
    error: { code: error.code, message: error.message },
  });
};

// ── Public endpoints (keyed by IP) ────────────────────────────────

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip ?? 'unknown',
  handler: rateLimitHandler,
});

export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip ?? 'unknown',
  handler: rateLimitHandler,
});

export const googleStartLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip ?? 'unknown',
  handler: rateLimitHandler,
});

export const publicSearchLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip ?? 'unknown',
  handler: rateLimitHandler,
});

// ── Authenticated endpoints (keyed by userId) ─────────────────────

export const categorySuggestionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.auth?.userId ?? req.ip ?? 'unknown',
  handler: rateLimitHandler,
});

export const phoneChangeLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 1 day
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.auth?.userId ?? req.ip ?? 'unknown',
  handler: rateLimitHandler,
});

export const uploadSignatureLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.auth?.userId ?? req.ip ?? 'unknown',
  handler: rateLimitHandler,
});

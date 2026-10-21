import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Request, RequestHandler } from 'express';

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

// In the test environment the in-memory store is shared across all requests
// in the same process, so tests would trip the limiter after only a few calls.
// Skip rate-limiting entirely in test mode; dedicated 429 tests opt back in
// by calling the limiter in isolation with a reset store.
const skipInTest = (_req: Request): boolean => process.env.NODE_ENV === 'test';

// ── Public endpoints (keyed by IP) ────────────────────────────────
// ipKeyGenerator normalises IPv6 addresses to /56 subnets so that different
// addresses within the same prefix share a bucket, preventing bypass via IPv6.

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? '127.0.0.1'),
  handler: rateLimitHandler,
  skip: skipInTest,
});

export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? '127.0.0.1'),
  handler: rateLimitHandler,
  skip: skipInTest,
});

export const googleStartLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? '127.0.0.1'),
  handler: rateLimitHandler,
  skip: skipInTest,
});

export const publicSearchLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? '127.0.0.1'),
  handler: rateLimitHandler,
  skip: skipInTest,
});

// ── Authenticated endpoints (keyed by userId) ─────────────────────

export const categorySuggestionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.auth?.userId ?? ipKeyGenerator(req.ip ?? '127.0.0.1'),
  handler: rateLimitHandler,
  skip: skipInTest,
});

export const phoneChangeLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 1 day
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.auth?.userId ?? ipKeyGenerator(req.ip ?? '127.0.0.1'),
  handler: rateLimitHandler,
  skip: skipInTest,
});

export const uploadSignatureLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.auth?.userId ?? ipKeyGenerator(req.ip ?? '127.0.0.1'),
  handler: rateLimitHandler,
  skip: skipInTest,
});

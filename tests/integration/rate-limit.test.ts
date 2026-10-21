/**
 * Rate-limit integration tests.
 *
 * The main rate limiters skip in NODE_ENV=test to avoid false positives in
 * other integration tests. Here we create purpose-built mini-apps with tiny
 * thresholds (no skip) to verify the 429 / RATE_LIMITED behaviour.
 */
import { describe, expect, it } from 'vitest';
import express from 'express';
import rateLimit from 'express-rate-limit';
import request from 'supertest';

import { AppError } from '../../src/lib/errors.js';

/** Build a minimal Express app with a rate limiter capped at `max` requests. */
const makeApp = (max: number) => {
  const app = express();
  app.use(express.json());

  const limiter = rateLimit({
    windowMs: 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      const error = new AppError(429, 'RATE_LIMITED', 'Too many requests, please try again later');
      res.status(error.status).json({
        success: false,
        error: { code: error.code, message: error.message },
      });
    },
    // Explicitly do NOT skip in test — this is the point of this test file.
    skip: () => false,
  });

  app.get('/ping', limiter, (_req, res) => {
    res.status(200).json({ ok: true });
  });

  return app;
};

describe('rate limiter', () => {
  it('allows requests under the limit', async () => {
    const app = makeApp(3);

    const res = await request(app).get('/ping');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('returns 429 RATE_LIMITED when the limit is exceeded', async () => {
    const app = makeApp(2);

    // First two requests should succeed.
    await request(app).get('/ping');
    await request(app).get('/ping');

    // Third request should be rate-limited.
    const res = await request(app).get('/ping');
    expect(res.status).toBe(429);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });

  it('returns the standard error envelope on 429', async () => {
    const app = makeApp(1);

    await request(app).get('/ping'); // exhaust limit

    const res = await request(app).get('/ping');
    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: expect.any(String),
      },
    });
  });
});

/**
 * Google OIDC integration tests.
 *
 * The wrapper functions (buildGoogleAuthUrl / handleGoogleCallback) are mocked
 * at the module boundary so no real network calls are made.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

import { createApp } from '../../src/app.js';
import { setGoogleConfig } from '../../src/lib/google.js';
import { truncateAll } from '../helpers/truncate.js';

const FRONTEND_ORIGIN = 'http://localhost:5173';

// ── Module-level mocks ──────────────────────────────────────────────────────

vi.mock('../../src/lib/google.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/google.js')>();
  return {
    ...actual,
    buildGoogleAuthUrl: vi.fn(),
    handleGoogleCallback: vi.fn(),
  };
});

// Pull the mocked references after vi.mock hoisting.
const { buildGoogleAuthUrl, handleGoogleCallback } = await import('../../src/lib/google.js');

// ── Helpers ─────────────────────────────────────────────────────────────────

const uniqueEmail = () =>
  `google-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;

const FAKE_FLOW = {
  authorizationUrl: 'https://accounts.google.com/o/oauth2/auth?mock=1',
  state: 'test-state-value',
  nonce: 'test-nonce-value',
  codeVerifier: 'test-code-verifier',
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Google OIDC flow', () => {
  beforeEach(async () => {
    await truncateAll();
    setGoogleConfig(null); // reset any cached config
    vi.resetAllMocks();

    // Default: buildGoogleAuthUrl returns fake params.
    vi.mocked(buildGoogleAuthUrl).mockResolvedValue(FAKE_FLOW);
  });

  afterEach(async () => {
    await truncateAll();
  });

  // ── GET /auth/google ─────────────────────────────────────────────

  describe('GET /api/v1/auth/google', () => {
    it('redirects to the Google authorization URL', async () => {
      const app = createApp();
      const res = await request(app).get('/api/v1/auth/google');

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe(FAKE_FLOW.authorizationUrl);
    });

    it('sets a short-lived HttpOnly km_google_flow cookie', async () => {
      const app = createApp();
      const res = await request(app).get('/api/v1/auth/google');

      const cookies: string[] = Array.isArray(res.headers['set-cookie'])
        ? res.headers['set-cookie']
        : [res.headers['set-cookie'] as string];

      const flowCookie = cookies.find((c) => c.startsWith('km_google_flow='));
      expect(flowCookie).toBeDefined();
      expect(flowCookie).toMatch(/HttpOnly/i);
    });
  });

  // ── GET /auth/google/callback ────────────────────────────────────

  describe('GET /api/v1/auth/google/callback', () => {
    it('creates a new user on first Google sign-in and redirects to FRONTEND_URL', async () => {
      const email = uniqueEmail();

      vi.mocked(handleGoogleCallback).mockResolvedValue({
        sub: 'google-sub-new-user',
        email,
        emailVerified: true,
      });

      const app = createApp();

      // Step 1: start flow to get the flow cookie.
      const startRes = await request(app).get('/api/v1/auth/google');
      const setCookies: string[] = Array.isArray(startRes.headers['set-cookie'])
        ? startRes.headers['set-cookie']
        : [startRes.headers['set-cookie'] as string];

      const flowCookieHeader = setCookies.find((c) => c.startsWith('km_google_flow='));
      const flowCookieValue = flowCookieHeader?.split(';')[0]; // e.g. "km_google_flow=..."

      expect(flowCookieValue).toBeDefined();

      // Step 2: simulate callback with the flow cookie.
      const callbackRes = await request(app)
        .get('/api/v1/auth/google/callback?code=mock_code&state=test-state-value')
        .set('Cookie', flowCookieValue!);

      expect(callbackRes.status).toBe(302);
      expect(callbackRes.headers.location).toBe(process.env.FRONTEND_URL ?? 'http://localhost:5173');

      // A session cookie should be set.
      const callbackCookies: string[] = Array.isArray(callbackRes.headers['set-cookie'])
        ? callbackRes.headers['set-cookie']
        : [callbackRes.headers['set-cookie'] as string];
      expect(callbackCookies.some((c) => c.startsWith('km_session='))).toBe(true);
    });

    it('logs in an existing Google user on subsequent sign-in', async () => {
      const email = uniqueEmail();
      const sub = 'google-sub-existing';

      vi.mocked(handleGoogleCallback).mockResolvedValue({
        sub,
        email,
        emailVerified: true,
      });

      const app = createApp();

      // First sign-in — creates the user.
      const startRes1 = await request(app).get('/api/v1/auth/google');
      const cookies1: string[] = Array.isArray(startRes1.headers['set-cookie'])
        ? startRes1.headers['set-cookie']
        : [startRes1.headers['set-cookie'] as string];
      const flowCookie1 = cookies1.find((c) => c.startsWith('km_google_flow='))?.split(';')[0];

      await request(app)
        .get('/api/v1/auth/google/callback?code=mock&state=test-state-value')
        .set('Cookie', flowCookie1!);

      // Second sign-in — logs in.
      vi.mocked(buildGoogleAuthUrl).mockResolvedValue(FAKE_FLOW);
      const startRes2 = await request(app).get('/api/v1/auth/google');
      const cookies2: string[] = Array.isArray(startRes2.headers['set-cookie'])
        ? startRes2.headers['set-cookie']
        : [startRes2.headers['set-cookie'] as string];
      const flowCookie2 = cookies2.find((c) => c.startsWith('km_google_flow='))?.split(';')[0];

      const callbackRes = await request(app)
        .get('/api/v1/auth/google/callback?code=mock&state=test-state-value')
        .set('Cookie', flowCookie2!);

      expect(callbackRes.status).toBe(302);
      expect(callbackRes.headers.location).toBe(process.env.FRONTEND_URL ?? 'http://localhost:5173');
    });

    it('redirects to error page with ACCOUNT_EXISTS when Google email belongs to a password account', async () => {
      const email = uniqueEmail();

      // First register with password.
      await request(createApp())
        .post('/api/v1/auth/register')
        .set('Origin', FRONTEND_ORIGIN)
        .send({ email, password: 'validPassword12!' });

      vi.mocked(handleGoogleCallback).mockResolvedValue({
        sub: 'google-sub-conflict',
        email,
        emailVerified: true,
      });

      const app = createApp();
      const startRes = await request(app).get('/api/v1/auth/google');
      const cookies: string[] = Array.isArray(startRes.headers['set-cookie'])
        ? startRes.headers['set-cookie']
        : [startRes.headers['set-cookie'] as string];
      const flowCookie = cookies.find((c) => c.startsWith('km_google_flow='))?.split(';')[0];

      const callbackRes = await request(app)
        .get('/api/v1/auth/google/callback?code=mock&state=test-state-value')
        .set('Cookie', flowCookie!);

      expect(callbackRes.status).toBe(302);
      expect(callbackRes.headers.location).toContain('ACCOUNT_EXISTS');
    });

    it('redirects to error page when flow cookie is missing', async () => {
      const app = createApp();

      const callbackRes = await request(app).get(
        '/api/v1/auth/google/callback?code=mock&state=test-state-value',
      );

      expect(callbackRes.status).toBe(302);
      expect(callbackRes.headers.location).toContain('CSRF_INVALID');
    });

    it('redirects to error page when Google email is not verified', async () => {
      const email = uniqueEmail();

      vi.mocked(handleGoogleCallback).mockResolvedValue({
        sub: 'google-sub-unverified',
        email,
        emailVerified: false, // not verified
      });

      const app = createApp();
      const startRes = await request(app).get('/api/v1/auth/google');
      const cookies: string[] = Array.isArray(startRes.headers['set-cookie'])
        ? startRes.headers['set-cookie']
        : [startRes.headers['set-cookie'] as string];
      const flowCookie = cookies.find((c) => c.startsWith('km_google_flow='))?.split(';')[0];

      const callbackRes = await request(app)
        .get('/api/v1/auth/google/callback?code=mock&state=test-state-value')
        .set('Cookie', flowCookie!);

      expect(callbackRes.status).toBe(302);
      expect(callbackRes.headers.location).toContain('FORBIDDEN');
    });
  });
});

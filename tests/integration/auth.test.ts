import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { createApp } from '../../src/app.js';
import { prisma } from '../../src/lib/prisma.js';

import { truncateAll } from '../helpers/truncate.js';
import { registerAndAuth } from '../helpers/auth.js';

const FRONTEND_ORIGIN = 'http://localhost:5173';

const uniqueEmail = (): string => `test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;

describe('auth endpoints', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  afterEach(async () => {
    await truncateAll();
  });

  // ── POST /auth/register ───────────────────────────────────────

  describe('POST /api/v1/auth/register', () => {
    it('registers a new user and returns 201 with user + csrfToken', async () => {
      const email = uniqueEmail();
      const res = await request(createApp())
        .post('/api/v1/auth/register')
        .set('Origin', FRONTEND_ORIGIN)
        .send({ email, password: 'validPassword12!', displayName: 'Test User' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user).toHaveProperty('id');
      expect(res.body.data.user.email).toBe(email);
      expect(res.body.data.user.displayName).toBe('Test User');
      expect(res.body.data.user.hasProviderProfile).toBe(false);
      expect(res.body.data.user.providerId).toBeNull();
      expect(res.body.data.csrfToken).toBeTypeOf('string');
      expect(res.headers['set-cookie']).toBeDefined();

      // Cookie should be HttpOnly
      const cookies = Array.isArray(res.headers['set-cookie'])
        ? res.headers['set-cookie']
        : [res.headers['set-cookie']];
      expect(cookies.some((c: string) => c.includes('HttpOnly'))).toBe(true);
    });

    it('rejects duplicate email with 409 EMAIL_TAKEN', async () => {
      const email = uniqueEmail();
      await request(createApp())
        .post('/api/v1/auth/register')
        .set('Origin', FRONTEND_ORIGIN)
        .send({ email, password: 'validPassword12!' });

      const res = await request(createApp())
        .post('/api/v1/auth/register')
        .set('Origin', FRONTEND_ORIGIN)
        .send({ email, password: 'anotherPassword12!' });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('EMAIL_TAKEN');
    });

    it('rejects invalid email with 400', async () => {
      const res = await request(createApp())
        .post('/api/v1/auth/register')
        .set('Origin', FRONTEND_ORIGIN)
        .send({ email: 'not-an-email', password: 'validPassword12!' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects short password with 400', async () => {
      const res = await request(createApp())
        .post('/api/v1/auth/register')
        .set('Origin', FRONTEND_ORIGIN)
        .send({ email: uniqueEmail(), password: 'short' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects missing Origin header with 403 CSRF_INVALID', async () => {
      const res = await request(createApp())
        .post('/api/v1/auth/register')
        .send({ email: uniqueEmail(), password: 'validPassword12!' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('CSRF_INVALID');
    });

    it('rejects wrong Origin with 403 CSRF_INVALID', async () => {
      const res = await request(createApp())
        .post('/api/v1/auth/register')
        .set('Origin', 'http://evil.com')
        .send({ email: uniqueEmail(), password: 'validPassword12!' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('CSRF_INVALID');
    });

    it('normalizes email to lowercase before storing', async () => {
      const email = 'Test.User@EXAMPLE.COM';
      const res = await request(createApp())
        .post('/api/v1/auth/register')
        .set('Origin', FRONTEND_ORIGIN)
        .send({ email, password: 'validPassword12!' });

      expect(res.status).toBe(201);
      expect(res.body.data.user.email).toBe('test.user@example.com');
    });
  });

  // ── POST /auth/login ──────────────────────────────────────────

  describe('POST /api/v1/auth/login', () => {
    it('logs in a registered user and returns 200 with user + csrfToken', async () => {
      const email = uniqueEmail();
      await request(createApp())
        .post('/api/v1/auth/register')
        .set('Origin', FRONTEND_ORIGIN)
        .send({ email, password: 'validPassword12!' });

      const res = await request(createApp())
        .post('/api/v1/auth/login')
        .set('Origin', FRONTEND_ORIGIN)
        .send({ email, password: 'validPassword12!' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe(email);
      expect(res.body.data.csrfToken).toBeTypeOf('string');
      expect(res.headers['set-cookie']).toBeDefined();
    });

    it('returns 401 INVALID_CREDENTIALS for wrong password', async () => {
      const email = uniqueEmail();
      await request(createApp())
        .post('/api/v1/auth/register')
        .set('Origin', FRONTEND_ORIGIN)
        .send({ email, password: 'validPassword12!' });

      const res = await request(createApp())
        .post('/api/v1/auth/login')
        .set('Origin', FRONTEND_ORIGIN)
        .send({ email, password: 'wrongPassword12!' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('returns 401 INVALID_CREDENTIALS for unknown email', async () => {
      const res = await request(createApp())
        .post('/api/v1/auth/login')
        .set('Origin', FRONTEND_ORIGIN)
        .send({ email: 'nonexistent@example.com', password: 'validPassword12!' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('returns the same error code for unknown email and wrong password (no enumeration)', async () => {
      const email = uniqueEmail();
      await request(createApp())
        .post('/api/v1/auth/register')
        .set('Origin', FRONTEND_ORIGIN)
        .send({ email, password: 'validPassword12!' });

      const unknownRes = await request(createApp())
        .post('/api/v1/auth/login')
        .set('Origin', FRONTEND_ORIGIN)
        .send({ email: 'nonexistent@example.com', password: 'validPassword12!' });

      const wrongPwRes = await request(createApp())
        .post('/api/v1/auth/login')
        .set('Origin', FRONTEND_ORIGIN)
        .send({ email, password: 'wrongPassword12!' });

      expect(unknownRes.status).toBe(wrongPwRes.status);
      expect(unknownRes.body.error.code).toBe(wrongPwRes.body.error.code);
      expect(unknownRes.body.error.message).toBe(wrongPwRes.body.error.message);
    });
  });

  // ── GET /auth/me ───────────────────────────────────────────────

  describe('GET /api/v1/auth/me', () => {
    it('returns the current user with csrfToken when authenticated', async () => {
      const app = createApp();
      const email = uniqueEmail();
      const auth = await registerAndAuth(app, email, 'validPassword12!');

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', auth.cookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe(email);
      expect(res.body.data.csrfToken).toBeTypeOf('string');
    });

    it('returns 401 when not authenticated', async () => {
      const res = await request(createApp()).get('/api/v1/auth/me');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('returns 401 with an invalid session cookie', async () => {
      const res = await request(createApp())
        .get('/api/v1/auth/me')
        .set('Cookie', 'km_session=invalid-token-value');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });
  });

  // ── POST /auth/logout ─────────────────────────────────────────

  describe('POST /api/v1/auth/logout', () => {
    it('logs out and clears the session cookie (204)', async () => {
      const app = createApp();
      const auth = await registerAndAuth(app, uniqueEmail(), 'validPassword12!');

      const res = await request(app)
        .post('/api/v1/auth/logout')
        .set('Origin', FRONTEND_ORIGIN)
        .set('Cookie', auth.cookie)
        .set('X-CSRF-Token', auth.csrfToken);

      expect(res.status).toBe(204);

      // Subsequent /me request should fail
      const meRes = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', auth.cookie);

      expect(meRes.status).toBe(401);
    });

    it('rejects logout without authentication (401)', async () => {
      const res = await request(createApp())
        .post('/api/v1/auth/logout')
        .set('Origin', FRONTEND_ORIGIN);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('rejects logout with wrong CSRF token (403)', async () => {
      const app = createApp();
      const auth = await registerAndAuth(app, uniqueEmail(), 'validPassword12!');

      const res = await request(app)
        .post('/api/v1/auth/logout')
        .set('Origin', FRONTEND_ORIGIN)
        .set('Cookie', auth.cookie)
        .set('X-CSRF-Token', 'invalid-csrf-token');

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('CSRF_INVALID');
    });

    it('rejects logout with missing CSRF token (403)', async () => {
      const app = createApp();
      const auth = await registerAndAuth(app, uniqueEmail(), 'validPassword12!');

      const res = await request(app)
        .post('/api/v1/auth/logout')
        .set('Origin', FRONTEND_ORIGIN)
        .set('Cookie', auth.cookie);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('CSRF_INVALID');
    });
  });

  // ── Session expiry / revocation ───────────────────────────────

  describe('session lifecycle', () => {
    it('revokes prior sessions on new login (old token invalidated)', async () => {
      const app = createApp();
      const email = uniqueEmail();
      const auth1 = await registerAndAuth(app, email, 'validPassword12!');

      // Login again — this should revoke auth1's session and create a new one.
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .set('Origin', FRONTEND_ORIGIN)
        .send({ email, password: 'validPassword12!' });

      expect(loginRes.status).toBe(200);
      const newCookie = `km_session=${
        loginRes.headers['set-cookie']?.[0]?.match(/km_session=([^;]+)/)?.[1]
      }`;

      // Old session should be revoked (revokeAllUserSessions is called on login).
      const meRes1 = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', auth1.cookie);

      expect(meRes1.status).toBe(401);

      // New session works
      const meRes2 = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', newCookie);

      expect(meRes2.status).toBe(200);
    });

    it('expired session returns 401', async () => {
      const app = createApp();
      const auth = await registerAndAuth(app, uniqueEmail(), 'validPassword12!');

      // Manually expire the session in the DB
      await prisma.session.updateMany({
        where: { userId: auth.userId },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', auth.cookie);

      expect(res.status).toBe(401);
    });

    it('idle-timed-out session returns 401', async () => {
      const app = createApp();
      const auth = await registerAndAuth(app, uniqueEmail(), 'validPassword12!');

      // Set lastSeenAt to 31 minutes ago (idle timeout is 30 min)
      await prisma.session.updateMany({
        where: { userId: auth.userId },
        data: { lastSeenAt: new Date(Date.now() - 31 * 60 * 1000) },
      });

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', auth.cookie);

      expect(res.status).toBe(401);
    });
  });

  // ── CSRF rejection ────────────────────────────────────────────

  describe('CSRF protection', () => {
    it('rejects state-changing request without Origin (403)', async () => {
      const res = await request(createApp())
        .post('/api/v1/auth/register')
        .send({ email: uniqueEmail(), password: 'validPassword12!' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('CSRF_INVALID');
    });

    it('rejects authenticated state-changing request with wrong CSRF token (403)', async () => {
      const app = createApp();
      const auth = await registerAndAuth(app, uniqueEmail(), 'validPassword12!');

      const res = await request(app)
        .post('/api/v1/auth/logout')
        .set('Origin', FRONTEND_ORIGIN)
        .set('Cookie', auth.cookie)
        .set('X-CSRF-Token', 'totally-wrong-token');

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('CSRF_INVALID');
    });
  });

  // ── No secrets in response ────────────────────────────────────

  describe('no secrets in response', () => {
    it('register response does not contain password or hash', async () => {
      const email = uniqueEmail();
      const res = await request(createApp())
        .post('/api/v1/auth/register')
        .set('Origin', FRONTEND_ORIGIN)
        .send({ email, password: 'validPassword12!' });

      const bodyStr = JSON.stringify(res.body);
      expect(bodyStr).not.toContain('validPassword12');
      expect(bodyStr).not.toContain('passwordHash');
      expect(bodyStr).not.toContain('tokenHash');
      expect(bodyStr).not.toContain('token');
      // csrfToken is expected, but raw session token should not be in the body
    });

    it('login response does not contain password or hash', async () => {
      const email = uniqueEmail();
      await request(createApp())
        .post('/api/v1/auth/register')
        .set('Origin', FRONTEND_ORIGIN)
        .send({ email, password: 'validPassword12!' });

      const res = await request(createApp())
        .post('/api/v1/auth/login')
        .set('Origin', FRONTEND_ORIGIN)
        .send({ email, password: 'validPassword12!' });

      const bodyStr = JSON.stringify(res.body);
      expect(bodyStr).not.toContain('validPassword12');
      expect(bodyStr).not.toContain('passwordHash');
      expect(bodyStr).not.toContain('tokenHash');
    });

    it('me response does not contain password or hash', async () => {
      const app = createApp();
      const auth = await registerAndAuth(app, uniqueEmail(), 'validPassword12!');

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', auth.cookie);

      const bodyStr = JSON.stringify(res.body);
      expect(bodyStr).not.toContain('passwordHash');
      expect(bodyStr).not.toContain('tokenHash');
    });
  });
});

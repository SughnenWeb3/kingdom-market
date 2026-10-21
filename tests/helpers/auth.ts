import type { Response } from 'supertest';

// Extract the Set-Cookie header value for a given cookie name.
export const getCookie = (res: Response, name: string): string | undefined => {
  const setCookies = res.headers['set-cookie'];
  if (!setCookies) return undefined;

  const cookies = Array.isArray(setCookies) ? setCookies : [setCookies];
  for (const cookie of cookies) {
    const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
    if (match) {
      return match[1];
    }
  }
  return undefined;
};

// Build a Cookie header string from a supertest response for subsequent requests.
export const extractCookieHeader = (res: Response, name: string): string | undefined => {
  const value = getCookie(res, name);
  if (!value) return undefined;
  return `${name}=${value}`;
};

type AuthHelper = {
  cookie: string;
  csrfToken: string;
  userId: string;
};

// Register a user and return the session cookie + CSRF token for authenticated requests.
export const registerAndAuth = async (
  app: unknown,
  email: string,
  password: string,
): Promise<AuthHelper> => {
  const { default: request } = await import('supertest');
  const res = await request(app)
    .post('/api/v1/auth/register')
    .set('Origin', 'http://localhost:5173')
    .send({ email, password, displayName: 'Test User' });

  const cookie = extractCookieHeader(res, 'km_session');
  const csrfToken = res.body.data?.csrfToken;
  const userId = res.body.data?.user?.id;

  if (!cookie || !csrfToken || !userId) {
    throw new Error(`Registration failed: ${JSON.stringify(res.body)}`);
  }

  return { cookie, csrfToken, userId };
};

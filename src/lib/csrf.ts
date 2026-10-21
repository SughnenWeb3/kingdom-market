import crypto from 'node:crypto';

import { env } from '../config/env.js';
import { AppError } from './errors.js';

const getSecret = (): string => {
  if (!env.CSRF_SECRET) {
    throw new AppError(500, 'INTERNAL', 'CSRF_SECRET is not configured');
  }
  return env.CSRF_SECRET;
};

// Generate CSRF token: HMAC-SHA256(CSRF_SECRET, sessionTokenHash).
// The token is tied to the session and cannot be guessed without the secret.
export const generateCsrfToken = (sessionTokenHash: string): string => {
  const secret = getSecret();
  return crypto.createHmac('sha256', secret).update(sessionTokenHash).digest('base64url');
};

// Verify CSRF token using timingSafeEqual to prevent timing attacks.
export const verifyCsrfToken = (token: string, sessionTokenHash: string): boolean => {
  const expected = generateCsrfToken(sessionTokenHash);
  const tokenBuffer = Buffer.from(token);
  const expectedBuffer = Buffer.from(expected);

  if (tokenBuffer.length !== expectedBuffer.length) return false;

  return crypto.timingSafeEqual(tokenBuffer, expectedBuffer);
};

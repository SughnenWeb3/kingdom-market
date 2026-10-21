import type { RequestHandler } from 'express';

import { AppError } from '../lib/errors.js';

// loadSession: looks up the session from the cookie token.
// Attaches req.auth and req.sessionTokenHash if a valid session exists.
// Does not reject unauthenticated requests — use requireAuth for that.
export const loadSession: RequestHandler = async (req, _res, next) => {
  try {
    const token = req.cookies?.[process.env.SESSION_COOKIE_NAME ?? 'km_session'] as
      | string
      | undefined;

    if (!token) {
      next();
      return;
    }

    // Import here to avoid circular dependency at module load time.
    const { hashToken, lookupSession } = await import('../lib/session.js');

    const tokenHash = hashToken(token);
    const session = await lookupSession(tokenHash);

    if (session) {
      req.auth = { userId: session.userId, sessionId: session.sessionId };
      req.sessionTokenHash = tokenHash;
    }

    next();
  } catch (error) {
    next(error);
  }
};

// requireAuth: rejects the request if no valid session is attached.
// Must be placed after loadSession in the middleware chain.
export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.auth) {
    next(new AppError(401, 'UNAUTHENTICATED', 'Authentication required'));
    return;
  }
  next();
};

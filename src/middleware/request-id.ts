import crypto from 'node:crypto';
import type { RequestHandler } from 'express';

import { logger } from '../lib/logger.js';

// Attach a UUID request ID to every request and set it on the response header.
// Also bind it to the logger so all log entries for this request are correlated.
export const requestIdMiddleware = (): RequestHandler => {
  return (req, res, next) => {
    const requestId = crypto.randomUUID();
    req.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);

    // Attach a child logger with the request ID for use in downstream handlers.
    (req as unknown as { log: typeof logger }).log = logger.child({ requestId });

    next();
  };
};

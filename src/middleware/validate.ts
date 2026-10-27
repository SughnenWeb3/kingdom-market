import type { RequestHandler } from 'express';
import { ZodError } from 'zod';

import { AppError, type ErrorDetail } from '../lib/errors.js';

type ZodSchema = {
  safeParse: (data: unknown) => { success: boolean; data?: unknown; error?: ZodError };
};

// Middleware factory: validate req.body (default) or req.query against a Zod schema.
// On failure, returns 400 VALIDATION_ERROR with field-level details.
// For 'query' target, the parsed result is stored on req.validatedQuery (req.query is read-only in Express 5).
export const validate = (schema: ZodSchema, target: 'body' | 'query' = 'body'): RequestHandler => {
  return (req, _res, next) => {
    const input = target === 'query' ? req.query : req.body;
    const result = schema.safeParse(input);

    if (!result.success) {
      const details: ErrorDetail[] = result.error!.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));
      next(new AppError(400, 'VALIDATION_ERROR', 'Validation failed', details));
      return;
    }

    if (target === 'query') {
      // req.query is a getter-only property in Express 5; store the parsed result separately.
      req.validatedQuery = result.data;
    } else {
      req.body = result.data;
    }
    next();
  };
};

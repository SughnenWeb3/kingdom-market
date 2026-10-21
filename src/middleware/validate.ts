import type { RequestHandler } from 'express';
import { ZodError } from 'zod';

import { AppError, type ErrorDetail } from '../lib/errors.js';

type ZodSchema = {
  safeParse: (data: unknown) => { success: boolean; data?: unknown; error?: ZodError };
};

// Middleware factory: validate req.body against a Zod schema.
// On failure, returns 400 VALIDATION_ERROR with field-level details.
export const validate = (schema: ZodSchema): RequestHandler => {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const details: ErrorDetail[] = result.error!.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));
      next(new AppError(400, 'VALIDATION_ERROR', 'Validation failed', details));
      return;
    }

    // Replace req.body with the parsed and transformed data.
    req.body = result.data;
    next();
  };
};

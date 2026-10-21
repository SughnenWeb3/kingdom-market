import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';

import { AppError, type ErrorDetail } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

// Central error handler. Maps AppError, ZodError, and known Prisma errors.
// Everything else is a logged 500 with a generic message.
// Stack traces and SQL never leave the process.
export const errorHandler: ErrorRequestHandler = (err, req, res, _next): void => {
  const requestId = req.requestId ?? 'unknown';

  // ── AppError: use the provided status and code ──────────────
  if (err instanceof AppError) {
    // Log auth errors as audit events
    if (err.code === 'INVALID_CREDENTIALS' || err.code === 'UNAUTHENTICATED') {
      logger.warn(
        { event: 'auth.failure', code: err.code, requestId },
        err.message,
      );
    } else if (err.status >= 500) {
      logger.error({ err, requestId }, err.message);
    }

    res.status(err.status).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    });
    return;
  }

  // ── ZodError: 400 VALIDATION_ERROR ──────────────────────────
  if (err instanceof ZodError) {
    const details: ErrorDetail[] = err.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));

    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details,
      },
    });
    return;
  }

  // ── Prisma errors ───────────────────────────────────────────
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const code = (err as { code: string }).code;

    if (code === 'P2002') {
      // Unique constraint violation
      logger.warn({ err, requestId }, 'Unique constraint violation');
      res.status(409).json({
        success: false,
        error: { code: 'EMAIL_TAKEN', message: 'A record with this value already exists' },
      });
      return;
    }

    if (code === 'P2025') {
      // Record not found
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Record not found' },
      });
      return;
    }
  }

  // ── Unknown error: log and return generic 500 ───────────────
  logger.error({ err, requestId }, 'Unhandled error');
  res.status(500).json({
    success: false,
    error: { code: 'INTERNAL', message: 'An unexpected error occurred' },
  });
};

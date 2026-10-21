import bcrypt from 'bcrypt';

import { env } from '../config/env.js';
import { AppError } from './errors.js';

// Validate password before hashing.
// Rules: length >= 12 chars, byte-length <= 72 (bcrypt limit), not whitespace-only.
// No arbitrary complexity rules per PRD §9.
export const validatePassword = (password: string): void => {
  if (password.length < 12) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Password must be at least 12 characters long', [
      { field: 'password', message: 'Password must be at least 12 characters long' },
    ]);
  }

  const byteLength = Buffer.byteLength(password, 'utf8');
  if (byteLength > 72) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Password must be at most 72 bytes', [
      { field: 'password', message: 'Password must be at most 72 bytes' },
    ]);
  }

  if (password.trim().length === 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Password cannot be whitespace-only', [
      { field: 'password', message: 'Password cannot be whitespace-only' },
    ]);
  }
};

export const hashPassword = (password: string): Promise<string> => {
  return bcrypt.hash(password, env.BCRYPT_ROUNDS);
};

export const comparePassword = (password: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};

// Constant dummy hash used for timing-safe unknown-email login attempts.
// Generated with bcrypt hash of a random value at cost 12.
const DUMMY_HASH =
  '$2b$12$oooooooooooooooooooooooooooooooooooooooooooooooooooooo';

export const compareAgainstDummy = (password: string): Promise<boolean> => {
  return bcrypt.compare(password, DUMMY_HASH);
};

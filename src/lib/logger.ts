import pino from 'pino';
import { pinoHttp } from 'pino-http';

import { env } from '../config/env.js';

const redactedPaths = [
  'req.headers.cookie',
  'req.headers.authorization',
  '*.password',
  '*.passwordHash',
  '*.token',
  '*.tokenHash',
  '*.phoneNumber',
  '*.whatsappNumber',
  '*.proposedPhone',
];

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: redactedPaths,
});

export const httpLogger = pinoHttp({
  logger,
  redact: redactedPaths,
});

import { createServer } from 'node:http';

import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { purgeExpiredSessions } from './lib/session.js';

const server = createServer(createApp());

server.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'HTTP server listening');
});

// Purge expired sessions hourly. .unref() so the interval doesn't keep the process alive.
const purgeInterval = setInterval(async () => {
  try {
    const count = await purgeExpiredSessions();
    if (count > 0) {
      logger.info({ event: 'session.purge', count }, 'Purged expired sessions');
    }
  } catch (error) {
    logger.error({ err: error }, 'Session purge failed');
  }
}, 60 * 60 * 1000); // 1 hour
purgeInterval.unref();

const shutdown = (signal: NodeJS.Signals): void => {
  logger.info({ signal }, 'Shutting down HTTP server');
  clearInterval(purgeInterval);
  server.close((error) => {
    if (error !== undefined) {
      logger.error({ err: error }, 'HTTP server shutdown failed');
      process.exitCode = 1;
    }
  });
};

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));

import { Writable } from 'node:stream';

import pino from 'pino';
import { describe, expect, it } from 'vitest';

import { redactedPaths } from '../../src/lib/logger.js';

describe('logger redaction', () => {
  it('removes credentials and session secrets from structured logs', () => {
    let output = '';
    const destination = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        output += chunk.toString();
        callback();
      },
    });
    const testLogger = pino({ redact: redactedPaths }, destination);

    testLogger.info({
      password: 'plain-password',
      passwordHash: 'password-hash',
      token: 'session-token',
      tokenHash: 'session-token-hash',
      req: { headers: { cookie: 'session-cookie' } },
    });

    const log = JSON.parse(output) as Record<string, unknown>;
    expect(log).toMatchObject({
      password: '[Redacted]',
      passwordHash: '[Redacted]',
      token: '[Redacted]',
      tokenHash: '[Redacted]',
      req: { headers: { cookie: '[Redacted]' } },
    });
    expect(output).not.toMatch(/plain-password|password-hash|session-token|session-cookie/);
  });
});

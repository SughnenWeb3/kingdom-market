import { describe, expect, it } from 'vitest';

import { generateSessionToken, hashToken } from '../../src/lib/session.js';

describe('session token utilities', () => {
  it('generates a base64url token of 43+ chars (32 bytes)', () => {
    const token = generateSessionToken();
    expect(token.length).toBeGreaterThanOrEqual(43); // 32 bytes base64url = 43 chars, no padding
    // Should not contain + or / or = (base64url charset)
    expect(token).not.toMatch(/[+/=]/);
  });

  it('generates unique tokens', () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      tokens.add(generateSessionToken());
    }
    expect(tokens.size).toBe(1000);
  });

  it('hashes a token to a hex SHA-256 digest', () => {
    const token = generateSessionToken();
    const hash = hashToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/); // SHA-256 = 64 hex chars
  });

  it('produces the same hash for the same token', () => {
    const token = 'test-token-value';
    expect(hashToken(token)).toBe(hashToken(token));
  });

  it('produces different hashes for different tokens', () => {
    expect(hashToken('token-a')).not.toBe(hashToken('token-b'));
  });
});

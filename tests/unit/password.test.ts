import { describe, expect, it } from 'vitest';

import { validatePassword, hashPassword, comparePassword, compareAgainstDummy } from '../../src/lib/password.js';

describe('validatePassword', () => {
  it('accepts a valid 12-character password', () => {
    expect(() => validatePassword('validPass12!')).not.toThrow();
  });

  it('rejects passwords shorter than 12 characters', () => {
    expect(() => validatePassword('short12345')).toThrow();
  });

  it('accepts a 72-byte password', () => {
    const pw = 'a'.repeat(72);
    expect(() => validatePassword(pw)).not.toThrow();
  });

  it('rejects passwords over 72 bytes', () => {
    const pw = 'a'.repeat(73);
    expect(() => validatePassword(pw)).toThrow();
  });

  it('rejects whitespace-only passwords', () => {
    expect(() => validatePassword('              ')).toThrow();
  });

  it('accepts passwords with special characters', () => {
    expect(() => validatePassword('P@ssw0rd!S3cur3')).not.toThrow();
  });

  it('accepts passwords with unicode (multibyte) within byte limit', () => {
    // Each 'é' is 2 bytes in UTF-8, so 36 chars = 72 bytes
    const pw = 'é'.repeat(36);
    expect(() => validatePassword(pw)).not.toThrow();
  });

  it('rejects unicode passwords over 72 bytes', () => {
    // Each 'é' is 2 bytes, 37 chars = 74 bytes
    const pw = 'é'.repeat(37);
    expect(() => validatePassword(pw)).toThrow();
  });
});

describe('hashPassword and comparePassword', () => {
  it('hashes a password and verifies it', async () => {
    const hash = await hashPassword('validPass12!');
    expect(hash).not.toBe('validPass12!');
    expect(await comparePassword('validPass12!', hash)).toBe(true);
  });

  it('rejects wrong password', async () => {
    const hash = await hashPassword('validPass12!');
    expect(await comparePassword('wrongPassword!', hash)).toBe(false);
  });
});

describe('compareAgainstDummy', () => {
  it('returns false for any password (used for timing-safe unknown-email)', async () => {
    expect(await compareAgainstDummy('somePassword123')).toBe(false);
    expect(await compareAgainstDummy('anyOtherPassword')).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';

import { normalizeEmail } from '../../src/lib/email.js';

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  John@Example.COM ')).toBe('john@example.com');
  });

  it('handles already-normalized email', () => {
    expect(normalizeEmail('user@test.com')).toBe('user@test.com');
  });

  it('collapses internal whitespace around the local part', () => {
    expect(normalizeEmail('  user@test.com  ')).toBe('user@test.com');
  });

  it('lowercases mixed case', () => {
    expect(normalizeEmail('User.Name@Example.COM')).toBe('user.name@example.com');
  });
});

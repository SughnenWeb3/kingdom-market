import crypto from 'node:crypto';

import { env } from '../config/env.js';
import { prisma } from './prisma.js';

// ── Token generation ──────────────────────────────────────────────

// 32 random bytes, base64url encoded. High-entropy opaque session token.
export const generateSessionToken = (): string => crypto.randomBytes(32).toString('base64url');

// SHA-256 hash of the token. Stored in DB, never compared directly.
// SHA-256 is correct here because the token is high-entropy (32 random bytes).
export const hashToken = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex');

// ── Cookie config ─────────────────────────────────────────────────

export const sessionCookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: env.SESSION_ABSOLUTE_TIMEOUT_DAYS * 24 * 60 * 60 * 1000,
};

// ── Session lifecycle ─────────────────────────────────────────────

export const createSession = async (userId: string): Promise<{ token: string; tokenHash: string }> => {
  const token = generateSessionToken();
  const tokenHash = hashToken(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + env.SESSION_ABSOLUTE_TIMEOUT_DAYS * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
      lastSeenAt: now,
    },
  });

  return { token, tokenHash };
};

// Look up a session by token hash. Returns null if not found, expired, or idle-timed-out.
export const lookupSession = async (
  tokenHash: string,
): Promise<{ userId: string; sessionId: string } | null> => {
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    select: { id: true, userId: true, expiresAt: true, lastSeenAt: true },
  });

  if (!session) return null;

  const now = new Date();

  // Absolute expiry
  if (session.expiresAt < now) return null;

  // Idle expiry
  const idleLimit = new Date(
    now.getTime() - env.SESSION_IDLE_TIMEOUT_MINUTES * 60 * 1000,
  );
  if (session.lastSeenAt < idleLimit) return null;

  // Update lastSeenAt at most once per minute to avoid a write per request.
  const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
  if (session.lastSeenAt < oneMinuteAgo) {
    await prisma.session.update({
      where: { id: session.id },
      data: { lastSeenAt: now },
    });
  }

  return { userId: session.userId, sessionId: session.id };
};

export const revokeSession = async (sessionId: string): Promise<void> => {
  await prisma.session.delete({ where: { id: sessionId } });
};

// Revoke all sessions for a user (used on new login to revoke prior tokens).
export const revokeAllUserSessions = async (userId: string): Promise<void> => {
  await prisma.session.deleteMany({ where: { userId } });
};

// Purge expired sessions. Called periodically via setInterval in server.ts.
export const purgeExpiredSessions = async (): Promise<number> => {
  const result = await prisma.session.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return result.count;
};

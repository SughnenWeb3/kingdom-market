import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { normalizeEmail } from '../../lib/email.js';
import { comparePassword, hashPassword, validatePassword, compareAgainstDummy } from '../../lib/password.js';
import {
  createSession,
  revokeSession,
  revokeAllUserSessions,
  hashToken,
} from '../../lib/session.js';
import { generateCsrfToken } from '../../lib/csrf.js';
import { buildGoogleAuthUrl, handleGoogleCallback, type GoogleUserInfo } from '../../lib/google.js';

// ── User public shape ───────────────────────────────────────────

export const toPublicUser = (user: {
  id: string;
  email: string;
  displayName: string | null;
  providerProfile: { id: string } | null;
}) => ({
  id: user.id,
  email: user.email,
  displayName: user.displayName,
  hasProviderProfile: user.providerProfile !== null,
  providerId: user.providerProfile?.id ?? null,
});

// ── Register ─────────────────────────────────────────────────────

export const register = async (
  email: string,
  password: string,
  displayName?: string,
): Promise<{
  user: ReturnType<typeof toPublicUser>;
  token: string;
  csrfToken: string;
}> => {
  const normalizedEmail = normalizeEmail(email);

  // Validate password before hashing.
  validatePassword(password);

  // Check for existing email.
  const existing = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true },
  });

  if (existing) {
    throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists');
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      email: normalizedEmail,
      passwordHash,
      displayName: displayName ?? null,
    },
    select: {
      id: true,
      email: true,
      displayName: true,
      providerProfile: { select: { id: true } },
    },
  });

  // Create session.
  const { token, tokenHash } = await createSession(user.id);
  const csrfToken = generateCsrfToken(tokenHash);

  logger.info({ event: 'auth.register.success', userId: user.id }, 'User registered');

  return { user: toPublicUser(user), token, csrfToken };
};

// ── Login ─────────────────────────────────────────────────────────

export const login = async (
  email: string,
  password: string,
): Promise<{
  user: ReturnType<typeof toPublicUser>;
  token: string;
  csrfToken: string;
}> => {
  const normalizedEmail = normalizeEmail(email);

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: {
      id: true,
      email: true,
      displayName: true,
      passwordHash: true,
      providerProfile: { select: { id: true } },
    },
  });

  // Timing-safe: if user not found, still run a bcrypt compare against a dummy hash.
  let isValid = false;
  if (user?.passwordHash) {
    isValid = await comparePassword(password, user.passwordHash);
  } else {
    // Run dummy compare to keep timing consistent regardless of email existence.
    await compareAgainstDummy(password);
  }

  if (!user || !isValid) {
    logger.warn({ event: 'auth.login.failure', email: normalizedEmail }, 'Login failed');
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }

  // New session on every login; revoke all prior sessions for this user.
  await revokeAllUserSessions(user.id);
  const { token, tokenHash } = await createSession(user.id);
  const csrfToken = generateCsrfToken(tokenHash);

  logger.info({ event: 'auth.login.success', userId: user.id }, 'Login successful');

  return { user: toPublicUser(user), token, csrfToken };
};

// ── Logout ────────────────────────────────────────────────────────

export const logout = async (sessionId: string): Promise<void> => {
  await revokeSession(sessionId);
  logger.info({ event: 'auth.logout.success', sessionId }, 'Logout successful');
};

// ── Get Me ────────────────────────────────────────────────────────

export const getMe = async (
  userId: string,
  tokenHash: string,
): Promise<{
  user: ReturnType<typeof toPublicUser>;
  csrfToken: string;
}> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      displayName: true,
      providerProfile: { select: { id: true } },
    },
  });

  if (!user) {
    throw new AppError(404, 'NOT_FOUND', 'User not found');
  }

  const csrfToken = generateCsrfToken(tokenHash);

  return { user: toPublicUser(user), csrfToken };
};

// ── Google OIDC flow ──────────────────────────────────────────────

export const startGoogleAuth = async (): Promise<{
  authorizationUrl: string;
  state: string;
  nonce: string;
  codeVerifier: string;
}> => {
  return buildGoogleAuthUrl();
};

export const completeGoogleAuth = async (
  callbackUrl: string,
  checks: { state: string; nonce: string; codeVerifier: string },
): Promise<{
  user: ReturnType<typeof toPublicUser>;
  token: string;
  csrfToken: string;
}> => {
  const userInfo: GoogleUserInfo = await handleGoogleCallback(callbackUrl, checks);

  if (!userInfo.emailVerified) {
    throw new AppError(403, 'FORBIDDEN', 'Google email is not verified');
  }

  const normalizedEmail = normalizeEmail(userInfo.email);

  // Check if an OAuthAccount already exists for this Google sub.
  const oauthAccount = await prisma.oAuthAccount.findUnique({
    where: {
      provider_providerAccountId: {
        provider: 'google',
        providerAccountId: userInfo.sub,
      },
    },
    select: { userId: true },
  });

  let userId: string;

  if (oauthAccount) {
    // Existing OAuth account → log in.
    userId = oauthAccount.userId;
  } else {
    // Check if email already belongs to a password account.
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, passwordHash: true },
    });

    if (existingUser?.passwordHash) {
      // Email belongs to a password account → do not link. Return ACCOUNT_EXISTS.
      throw new AppError(409, 'ACCOUNT_EXISTS', 'An account with this email already exists');
    }

    if (existingUser) {
      // User exists without password (e.g. from another OAuth provider) — link.
      userId = existingUser.id;
    } else {
      // Create new user with no password.
      const newUser = await prisma.user.create({
        data: {
          email: normalizedEmail,
          passwordHash: null,
        },
        select: { id: true },
      });
      userId = newUser.id;
    }

    // Create the OAuthAccount link.
    await prisma.oAuthAccount.create({
      data: {
        userId,
        provider: 'google',
        providerAccountId: userInfo.sub,
      },
    });
  }

  // Create session.
  const { token, tokenHash } = await createSession(userId);
  const csrfToken = generateCsrfToken(tokenHash);

  logger.info({ event: 'auth.google.success', userId }, 'Google login successful');

  // Fetch user for response.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      displayName: true,
      providerProfile: { select: { id: true } },
    },
  });

  if (!user) {
    throw new AppError(500, 'INTERNAL', 'Failed to load user after Google auth');
  }

  return { user: toPublicUser(user), token, csrfToken };
};

// Re-export hashToken for use in controller cookie clearing.
export { hashToken };

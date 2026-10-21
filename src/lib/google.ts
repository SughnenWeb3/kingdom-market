import * as oidc from 'openid-client';

import { env } from '../config/env.js';

// Google's OIDC issuer URL.
const GOOGLE_ISSUER = 'https://accounts.google.com';

let configCache: oidc.Configuration | null = null;

// Discover Google's OIDC configuration once and cache it.
// In tests, this is mocked at the wrapper boundary.
export const getGoogleConfig = async (): Promise<oidc.Configuration> => {
  if (configCache) return configCache;

  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_CALLBACK_URL) {
    throw new Error('Google OIDC credentials are not configured');
  }

  configCache = await oidc.discovery(
    new URL(GOOGLE_ISSUER),
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
  );

  return configCache;
};

// Allow tests to inject a mock config.
export const setGoogleConfig = (config: oidc.Configuration | null): void => {
  configCache = config;
};

export type GoogleAuthParams = {
  authorizationUrl: string;
  state: string;
  nonce: string;
  codeVerifier: string;
};

// Build the authorization URL with PKCE, state, and nonce.
// All three values must be stored in a short-lived signed cookie and verified on callback.
export const buildGoogleAuthUrl = async (): Promise<GoogleAuthParams> => {
  const config = await getGoogleConfig();

  const codeVerifier = oidc.randomPKCECodeVerifier();
  const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
  const state = oidc.randomState();
  const nonce = oidc.randomNonce();

  const authorizationUrl = oidc.buildAuthorizationUrl(config, {
    redirect_uri: env.GOOGLE_CALLBACK_URL ?? '',
    scope: 'openid email profile',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
    nonce,
  });

  return {
    authorizationUrl: authorizationUrl.href,
    state,
    nonce,
    codeVerifier,
  };
};

export type GoogleUserInfo = {
  sub: string;
  email: string;
  emailVerified: boolean;
};

// Process the callback: validate state, nonce, PKCE, and ID token.
// Returns the verified Google user info (sub, email, email_verified).
export const handleGoogleCallback = async (
  callbackUrl: string,
  checks: { state: string; nonce: string; codeVerifier: string },
): Promise<GoogleUserInfo> => {
  const config = await getGoogleConfig();

  const tokenSet = await oidc.authorizationCodeGrant(config, new URL(callbackUrl), {
    pkceCodeVerifier: checks.codeVerifier,
    expectedState: checks.state,
    expectedNonce: checks.nonce,
    idTokenExpected: true,
  });

  const claims = tokenSet.claims();

  if (!claims) {
    throw new Error('No ID token claims returned from Google');
  }

  return {
    sub: String(claims.sub),
    email: claims.email ? String(claims.email) : '',
    emailVerified: claims.email_verified === true,
  };
};

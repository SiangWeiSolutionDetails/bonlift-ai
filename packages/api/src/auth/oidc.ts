import * as client from "openid-client";
import { readAuthConfig, type AuthConfig } from "../config/env.js";
import { UnauthorizedError } from "../errors.js";
import type { VerifiedIdentity } from "../services/user.service.js";

export type AuthProvider = "google";

export interface OAuthTransaction {
  state: string;
  nonce: string;
  codeVerifier: string;
  returnTo: string;
}

const ISSUERS: Record<AuthProvider, URL> = {
  google: new URL("https://accounts.google.com"),
};
const SCOPES = "openid email profile";

const discoveries = new Map<AuthProvider, Promise<client.Configuration>>();

export function redirectUri(config: AuthConfig, provider: AuthProvider): string {
  return `${config.appBaseUrl}/api/auth/callback/${provider}`;
}

// Cached per provider; a failed discovery is dropped so the next sign-in retries it.
function discover(provider: AuthProvider): Promise<client.Configuration> {
  const cached = discoveries.get(provider);
  if (cached) return cached;
  const { clientId, clientSecret } = readAuthConfig()[provider];
  const pending = client.discovery(ISSUERS[provider], clientId, clientSecret);
  discoveries.set(provider, pending);
  pending.catch(() => discoveries.delete(provider));
  return pending;
}

// Google skips its account chooser when one account is signed in, unless asked
export function promptParams(selectAccount: boolean): { prompt?: string } {
  return selectAccount ? { prompt: "select_account" } : {};
}

export interface SignInOptions {
  selectAccount?: boolean;
  loginHint?: string;
}

// The hint only pre-fills Google's form; it is never treated as the user's identity
export function hintParams(loginHint?: string): { login_hint?: string } {
  return loginHint ? { login_hint: loginHint } : {};
}

export async function startSignIn(
  provider: AuthProvider,
  returnTo: string,
  { selectAccount = false, loginHint }: SignInOptions = {},
): Promise<{ url: URL; tx: OAuthTransaction }> {
  const oidcConfig = await discover(provider);
  const tx: OAuthTransaction = {
    state: client.randomState(),
    nonce: client.randomNonce(),
    codeVerifier: client.randomPKCECodeVerifier(),
    returnTo,
  };
  const url = client.buildAuthorizationUrl(oidcConfig, {
    redirect_uri: redirectUri(readAuthConfig(), provider),
    scope: SCOPES,
    state: tx.state,
    nonce: tx.nonce,
    code_challenge: await client.calculatePKCECodeChallenge(tx.codeVerifier),
    code_challenge_method: "S256",
    ...promptParams(selectAccount),
    ...hintParams(loginHint),
  });
  return { url, tx };
}

function toVerifiedIdentity(provider: AuthProvider, claims: client.IDToken | undefined): VerifiedIdentity {
  if (!claims || typeof claims.email !== "string") {
    throw new UnauthorizedError("The identity provider did not return an email address");
  }
  return {
    provider,
    subject: claims.sub,
    email: claims.email,
    emailVerified: claims.email_verified === true,
    name: typeof claims.name === "string" ? claims.name : null,
  };
}

export async function finishSignIn(
  provider: AuthProvider,
  currentUrl: URL,
  tx: OAuthTransaction,
): Promise<VerifiedIdentity> {
  const oidcConfig = await discover(provider);
  const tokens = await client.authorizationCodeGrant(oidcConfig, currentUrl, {
    expectedState: tx.state,
    expectedNonce: tx.nonce,
    pkceCodeVerifier: tx.codeVerifier,
  });
  return toVerifiedIdentity(provider, tokens.claims());
}

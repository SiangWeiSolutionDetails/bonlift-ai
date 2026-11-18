import type { CookieSerializeOptions } from "@fastify/cookie";
import {
  AuthLoginQuerySchema,
  AuthLoginQuerySchemaType,
  AuthMeResponseSchema,
  type AuthProvider,
  AuthProviderParamsSchema,
  AuthProviderParamsSchemaType,
  AuthProvidersResponseSchema,
  UpdateOwnNameBodySchema,
  UpdateOwnNameBodySchemaType,
} from "@bonlift-ai/contracts";
import { getPool } from "@bonlift-ai/db";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import * as oidcClient from "openid-client";
import { finishSignIn, startSignIn, type OAuthTransaction } from "../auth/oidc.js";
import { safeReturnTo } from "../auth/returnTo.js";
import { assertSameOriginWrite } from "../auth/sameOrigin.js";
import { enabledAuthProviders, readAuthConfig } from "../config/env.js";
import { AccountNotApprovedError, NotFoundError, UnauthorizedError } from "../errors.js";
import {
  createSession,
  deleteSession,
  SESSION_ABSOLUTE_MS,
} from "../services/session.service.js";
import { findSessionUserAccess, updateOwnName } from "../services/userAccess.service.js";
import { resolveUserFromIdentity } from "../services/user.service.js";

export const SESSION_COOKIE = "sid";
const TX_COOKIE = "oauth_tx";
const TX_MAX_AGE_S = 10 * 60;

type SignInErrorCode = "ACCOUNT_NOT_APPROVED" | "SIGN_IN_FAILED";

function sessionCookieOptions(): CookieSerializeOptions {
  return {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: readAuthConfig().secureCookies,
  };
}

// The browser path: the proxy strips /api, but the browser only sends the cookie back under the path it sees.
function txCookieOptions(): CookieSerializeOptions {
  return {
    path: "/api/auth/callback",
    httpOnly: true,
    sameSite: "lax",
    secure: readAuthConfig().secureCookies,
  };
}

export function readSessionCookie(request: FastifyRequest): string | undefined {
  return request.cookies[SESSION_COOKIE] || undefined;
}

function isTransaction(value: unknown): value is OAuthTransaction {
  const tx = value as Partial<OAuthTransaction> | null;
  return (
    typeof tx === "object" &&
    tx !== null &&
    (tx.provider === "google" || tx.provider === "microsoft") &&
    typeof tx.state === "string" &&
    typeof tx.nonce === "string" &&
    typeof tx.codeVerifier === "string" &&
    typeof tx.returnTo === "string"
  );
}

function readTransaction(request: FastifyRequest): OAuthTransaction | null {
  const raw = request.cookies[TX_COOKIE];
  if (!raw) return null;
  const unsigned = request.unsignCookie(raw);
  if (!unsigned.valid || unsigned.value === null) return null;
  try {
    const parsed: unknown = JSON.parse(unsigned.value);
    return isTransaction(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isOpenIdClientError(error: unknown): boolean {
  return (
    error instanceof oidcClient.ClientError ||
    error instanceof oidcClient.ResponseBodyError ||
    error instanceof oidcClient.AuthorizationResponseError ||
    error instanceof oidcClient.WWWAuthenticateChallengeError
  );
}

// openid-client errors can carry the token response body or the callback parameters: log their names and codes
// only. Other errors are ours or pg's, so their stack is safe to log.
function logSignInFailure(request: FastifyRequest, error: unknown): void {
  const err = error as
    | { name?: unknown; code?: unknown; error?: unknown; message?: unknown; stack?: unknown }
    | null;
  request.log.error(
    {
      errorName: err?.name,
      errorCode: err?.code,
      oauthError: typeof err?.error === "string" ? err.error : undefined,
      errorMessage: err?.message,
      stack: isOpenIdClientError(error) ? undefined : err?.stack,
    },
    "sign-in failed",
  );
}

function redirectToLogin(reply: FastifyReply, code: SignInErrorCode): FastifyReply {
  return reply.redirect(`/login?error=${code}`);
}

function isProviderEnabled(provider: AuthProvider): boolean {
  return enabledAuthProviders(readAuthConfig())[provider];
}

function refuseDisabledProvider(request: FastifyRequest, reply: FastifyReply, provider: AuthProvider): FastifyReply {
  request.log.warn({ provider }, "sign-in attempted with a disabled provider");
  return redirectToLogin(reply, "SIGN_IN_FAILED");
}

// openid-client derives redirect_uri from this URL minus its query, so it must be the URL the browser called.
function callbackUrl(request: FastifyRequest): URL {
  return new URL(readAuthConfig().appBaseUrl + "/api" + request.url);
}

async function signIn(
  request: FastifyRequest<{ Params: AuthProviderParamsSchemaType }>,
  tx: OAuthTransaction,
): Promise<string> {
  const pool = getPool();
  const { provider } = request.params;
  const identity = await finishSignIn(provider, callbackUrl(request), tx);
  const user = await resolveUserFromIdentity(pool, identity);
  const previousToken = readSessionCookie(request);
  if (previousToken) await deleteSession(pool, previousToken);
  return createSession(pool, user.id, provider, request.headers["user-agent"] ?? null);
}

export async function authRoutes(app: FastifyInstance) {
  app.get(
    "/auth/providers",
    { schema: { response: { 200: AuthProvidersResponseSchema } } },
    async (_request, reply) => {
      reply.header("Cache-Control", "no-store");
      return enabledAuthProviders(readAuthConfig());
    },
  );

  app.get<{ Params: AuthProviderParamsSchemaType; Querystring: AuthLoginQuerySchemaType }>(
    "/auth/login/:provider",
    {
      schema: { params: AuthProviderParamsSchema, querystring: AuthLoginQuerySchema },
      attachValidation: true,
    },
    async (request, reply) => {
      if (request.validationError?.validationContext === "params") {
        throw new NotFoundError("Unknown sign-in provider");
      }
      if (!isProviderEnabled(request.params.provider)) {
        return refuseDisabledProvider(request, reply, request.params.provider);
      }
      try {
        const { url, tx } = await startSignIn(
          request.params.provider,
          safeReturnTo(request.query.returnTo),
          {
            selectAccount: request.query.selectAccount === "1",
            loginHint: request.validationError ? undefined : request.query.loginHint,
          },
        );
        reply.setCookie(TX_COOKIE, JSON.stringify(tx), {
          ...txCookieOptions(),
          signed: true,
          maxAge: TX_MAX_AGE_S,
        });
        return reply.redirect(url.href);
      } catch (error) {
        logSignInFailure(request, error);
        return redirectToLogin(reply, "SIGN_IN_FAILED");
      }
    },
  );

  // Every outcome redirects to the admin: the browser lands here, so a JSON error page is never shown.
  app.get<{ Params: AuthProviderParamsSchemaType }>(
    "/auth/callback/:provider",
    { schema: { params: AuthProviderParamsSchema }, attachValidation: true },
    async (request, reply) => {
      const tx = readTransaction(request);
      reply.clearCookie(TX_COOKIE, txCookieOptions());
      // A transaction started for one provider must never be finished by another provider's callback.
      if (request.validationError || !tx || tx.provider !== request.params.provider) {
        request.log.warn("sign-in callback without a valid provider or matching transaction cookie");
        return redirectToLogin(reply, "SIGN_IN_FAILED");
      }
      if (!isProviderEnabled(tx.provider)) return refuseDisabledProvider(request, reply, tx.provider);

      try {
        const token = await signIn(request, tx);
        reply.setCookie(SESSION_COOKIE, token, {
          ...sessionCookieOptions(),
          maxAge: SESSION_ABSOLUTE_MS / 1000,
        });
        return reply.redirect(tx.returnTo);
      } catch (error) {
        if (error instanceof AccountNotApprovedError) {
          request.log.info({ reason: error.reason, provider: request.params.provider }, "sign-in refused");
          return redirectToLogin(reply, "ACCOUNT_NOT_APPROVED");
        }
        logSignInFailure(request, error);
        return redirectToLogin(reply, "SIGN_IN_FAILED");
      }
    },
  );

  app.get(
    "/auth/me",
    { schema: { response: { 200: AuthMeResponseSchema } } },
    async (request, reply) => {
      const token = readSessionCookie(request);
      const user = token ? await findSessionUserAccess(getPool(), token) : null;
      if (!user) throw new UnauthorizedError("Not signed in");
      reply.header("Cache-Control", "no-store");
      return user;
    },
  );

  // onRequest runs before body validation, so a cross-site or signed-out request is refused whatever it sends.
  app.patch<{ Body: UpdateOwnNameBodySchemaType }>(
    "/auth/me",
    {
      onRequest: async (request) => {
        assertSameOriginWrite(request);
        if (!readSessionCookie(request)) throw new UnauthorizedError("Not signed in");
      },
      schema: { body: UpdateOwnNameBodySchema, response: { 200: AuthMeResponseSchema } },
    },
    async (request, reply) => {
      const user = await updateOwnName(getPool(), readSessionCookie(request)!, request.body);
      reply.header("Cache-Control", "no-store");
      return user;
    },
  );

  app.post("/auth/logout", async (request, reply) => {
    assertSameOriginWrite(request);
    const token = readSessionCookie(request);
    if (token) await deleteSession(getPool(), token);
    reply.clearCookie(SESSION_COOKIE, sessionCookieOptions());
    return reply.status(204).send();
  });
}

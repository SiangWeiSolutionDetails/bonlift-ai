import type { CookieSerializeOptions } from "@fastify/cookie";
import {
  AuthLoginQuerySchema,
  AuthLoginQuerySchemaType,
  AuthMeResponseSchema,
  AuthProviderParamsSchema,
  AuthProviderParamsSchemaType,
} from "@bonlift-ai/contracts";
import { getPool } from "@bonlift-ai/db";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { finishSignIn, startSignIn, type OAuthTransaction } from "../auth/oidc.js";
import { safeReturnTo } from "../auth/returnTo.js";
import { readAuthConfig } from "../config/env.js";
import { AccountNotApprovedError, NotFoundError, UnauthorizedError } from "../errors.js";
import {
  createSession,
  deleteSession,
  findSessionUser,
  SESSION_ABSOLUTE_MS,
} from "../services/session.service.js";
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

// openid-client errors can carry the token response body or the callback parameters: log their names and codes only.
function logSignInFailure(request: FastifyRequest, error: unknown): void {
  const err = error as { name?: unknown; code?: unknown; error?: unknown; message?: unknown } | null;
  request.log.error(
    {
      errorName: err?.name,
      errorCode: err?.code,
      oauthError: typeof err?.error === "string" ? err.error : undefined,
      errorMessage: err?.message,
    },
    "sign-in failed",
  );
}

function redirectToLogin(reply: FastifyReply, code: SignInErrorCode): FastifyReply {
  return reply.redirect(`/login?error=${code}`);
}

// openid-client derives redirect_uri from this URL minus its query, so it must be the URL the browser called.
function callbackUrl(request: FastifyRequest): URL {
  return new URL(readAuthConfig().appBaseUrl + "/api" + request.url);
}

async function signIn(request: FastifyRequest, tx: OAuthTransaction): Promise<string> {
  const pool = getPool();
  const identity = await finishSignIn("google", callbackUrl(request), tx);
  const user = await resolveUserFromIdentity(pool, identity);
  return createSession(pool, user.id, request.headers["user-agent"] ?? null);
}

export async function authRoutes(app: FastifyInstance) {
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
      try {
        const { url, tx } = await startSignIn(request.params.provider, safeReturnTo(request.query.returnTo));
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
      if (request.validationError || !tx) {
        request.log.warn("sign-in callback without a valid provider or transaction cookie");
        return redirectToLogin(reply, "SIGN_IN_FAILED");
      }

      try {
        const token = await signIn(request, tx);
        reply.setCookie(SESSION_COOKIE, token, {
          ...sessionCookieOptions(),
          maxAge: SESSION_ABSOLUTE_MS / 1000,
        });
        return reply.redirect(tx.returnTo);
      } catch (error) {
        if (error instanceof AccountNotApprovedError) return redirectToLogin(reply, "ACCOUNT_NOT_APPROVED");
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
      const user = token ? await findSessionUser(getPool(), token) : null;
      if (!user) throw new UnauthorizedError("Not signed in");
      reply.header("Cache-Control", "no-store");
      return user;
    },
  );

  app.post("/auth/logout", async (request, reply) => {
    const token = readSessionCookie(request);
    if (token) await deleteSession(getPool(), token);
    reply.clearCookie(SESSION_COOKIE, sessionCookieOptions());
    return reply.status(204).send();
  });
}

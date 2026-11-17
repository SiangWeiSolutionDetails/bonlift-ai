import type { FastifyRequest } from "fastify";
import type { Pool } from "pg";
import { assertSameOriginWrite } from "../auth/sameOrigin.js";
import { UnauthorizedError } from "../errors.js";
import { readSessionCookie } from "../routes/auth.route.js";
import { findSessionUser, type SessionUser } from "../services/session.service.js";

declare module "fastify" {
  interface FastifyRequest {
    user: SessionUser | null;
  }
}

export function createAdminSessionHook(getPool: () => Pool) {
  return async (request: FastifyRequest) => {
    assertSameOriginWrite(request);
    const token = readSessionCookie(request);
    const user = token ? await findSessionUser(getPool(), token) : null;
    if (!user) throw new UnauthorizedError("Not signed in");
    request.user = user;
  };
}

import { isBrandAction, isConsoleAction, type BrandAction } from "@bonlift-ai/contracts";
import type { FastifyInstance, FastifyRequest, RouteOptions } from "fastify";
import type { Pool } from "pg";
import { assertSameOriginWrite } from "../auth/sameOrigin.js";
import { ForbiddenError, NotFoundError, UnauthorizedError } from "../errors.js";
import { readSessionCookie } from "../routes/auth.route.js";
import {
  authorizeRequest,
  checksOf,
  resolveBrandRef,
  type AccessCheck,
  type Authorization,
  type BrandRef,
  type RequestAccess,
  type RouteAccess,
} from "../services/authorization.service.js";
import { isSessionToken } from "../services/session.service.js";

declare module "fastify" {
  interface FastifyContextConfig {
    access?: RouteAccess;
  }
  interface FastifyRequest {
    access: RequestAccess | null;
    brandActions: BrandAction[] | null;
  }
}

const BRAND_REFS: readonly BrandRef[] = ["params.brandId", "params.outletId", "params.runId", "body.brandId"];

function isBrandRef(value: unknown): value is BrandRef {
  return BRAND_REFS.includes(value as BrandRef);
}

function checkError(check: AccessCheck): string | null {
  if ("console" in check) return isConsoleAction(check.console) ? null : `"${check.console}" is not a console action`;
  if ("brandUser" in check) return isBrandRef(check.brandUser) ? null : `"${check.brandUser}" is not a brand ref`;
  if (!isBrandAction(check.brand)) return `"${check.brand}" is not a brand action`;
  return isBrandRef(check.from) ? null : `"${check.from}" is not a brand ref`;
}

function assertDeclaredAccess(route: RouteOptions): void {
  const label = `${[route.method].flat().join(",")} ${route.url}`;
  const access = route.config?.access;
  if (!access) throw new Error(`${label} has no access declaration`);
  if (access !== "signedIn" && "anyOf" in access && access.anyOf.length === 0) {
    throw new Error(`${label} declares an empty anyOf`);
  }
  for (const check of checksOf(access)) {
    const error = checkError(check);
    if (error) throw new Error(`${label}: ${error}`);
  }
  try {
    resolveBrandRef(access);
  } catch (error) {
    throw new Error(`${label}: ${(error as Error).message}`);
  }
}

function stringField(source: unknown, key: string): string | undefined {
  if (typeof source !== "object" || source === null) return undefined;
  const value = (source as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

function refsOf(request: FastifyRequest): Partial<Record<BrandRef, string>> {
  const refs: Partial<Record<BrandRef, string>> = {};
  for (const ref of BRAND_REFS) {
    const [source, key] = ref.split(".");
    const value = stringField(source === "params" ? request.params : request.body, key);
    if (value !== undefined) refs[ref] = value;
  }
  return refs;
}

function assertAllowed(result: Authorization | null): Authorization {
  if (!result) throw new UnauthorizedError("Not signed in");
  if (result.decision === "forbidden") throw new ForbiddenError("Not allowed");
  if (result.decision === "notFound") throw new NotFoundError("Not found");
  return result;
}

async function checkSessionCookie(request: FastifyRequest): Promise<void> {
  assertSameOriginWrite(request);
  const token = readSessionCookie(request);
  if (!token || !isSessionToken(token)) throw new UnauthorizedError("Not signed in");
}

function createAuthorizeHook(getPool: () => Pool) {
  return async (request: FastifyRequest) => {
    const access = request.routeOptions.config.access!;
    const token = readSessionCookie(request)!;
    const result = assertAllowed(await authorizeRequest(getPool(), token, access, refsOf(request)));
    request.access = result.access;
    request.brandActions = result.brandActions;
  };
}

// Register before any admin route: onRoute only sees routes added after it.
export function registerAdminAccess(admin: FastifyInstance, getPool: () => Pool): void {
  admin.decorateRequest("access", null);
  admin.decorateRequest("brandActions", null);
  admin.addHook("onRoute", assertDeclaredAccess);
  admin.addHook("onRequest", checkSessionCookie);
  admin.addHook("preHandler", createAuthorizeHook(getPool));
}

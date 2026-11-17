import type { FastifyRequest } from "fastify";
import { readAuthConfig } from "../config/env.js";
import { ForbiddenError } from "../errors.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function headerValue(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

// CSRF guard for cookie-authenticated writes: a browser always sends Sec-Fetch-Site or Origin on a cross-site
// POST (including text/plain forms), while scripts send neither and carry no ambient cookie anyway.
export function assertSameOriginWrite(request: FastifyRequest): void {
  if (SAFE_METHODS.has(request.method)) return;
  const fetchSite = headerValue(request, "sec-fetch-site");
  if (fetchSite !== undefined && fetchSite !== "same-origin") {
    throw new ForbiddenError("Cross-site request refused");
  }
  const origin = headerValue(request, "origin");
  if (origin !== undefined && origin !== readAuthConfig().appBaseUrl) {
    throw new ForbiddenError("Cross-site request refused");
  }
}

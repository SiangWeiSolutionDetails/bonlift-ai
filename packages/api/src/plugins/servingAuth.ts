import type { FastifyRequest } from "fastify";
import { Pool } from "pg";
import { ServiceUnavailableError, UnauthorizedError } from "../errors.js";
import {
  BrandApiKeyMatch,
  findLiveBrandApiKey,
  isSameApiKey,
  parseApiKeyPrefix,
} from "../services/brandApiKey.service.js";

declare module "fastify" {
  interface FastifyRequest {
    servingBrandId: string | null;
  }
}

export const API_KEY_CACHE_TTL_MS = 60_000;

export interface ServingKeyAuthOptions {
  getPool: () => Pool;
  ttlMs?: number;
  now?: () => number;
}

export interface ServingCaller {
  brandId: string;
  name: string;
}

// Only live keys are cached, so the cache is bounded by the number of keys. A revoked key keeps working
// until its entry expires (at most ttlMs); an expired key stops at once because expiresAt is checked on every hit.
export function createServingKeyAuthenticator({
  getPool,
  ttlMs = API_KEY_CACHE_TTL_MS,
  now = Date.now,
}: ServingKeyAuthOptions) {
  const cache = new Map<string, { match: BrandApiKeyMatch; cachedAt: number }>();

  async function findMatch(keyPrefix: string): Promise<BrandApiKeyMatch | null> {
    const cached = cache.get(keyPrefix);
    if (cached && now() - cached.cachedAt < ttlMs) return cached.match;

    cache.delete(keyPrefix);
    const match = await findLiveBrandApiKey(getPool(), keyPrefix);
    if (match) cache.set(keyPrefix, { match, cachedAt: now() });
    return match;
  }

  return async function authenticate(
    presented: string | undefined,
  ): Promise<ServingCaller | null> {
    // A malformed key never reaches the database.
    const keyPrefix = parseApiKeyPrefix(presented);
    if (!keyPrefix || !presented) return null;

    const match = await findMatch(keyPrefix);
    if (!match || !isSameApiKey(match, presented)) return null;
    if (match.expiresAt && match.expiresAt.getTime() <= now()) return null;

    return { brandId: match.brandId, name: match.name };
  };
}

export function createServingAuthHook(
  authenticate: ReturnType<typeof createServingKeyAuthenticator>,
) {
  return async (request: FastifyRequest) => {
    const header = request.headers["x-api-key"];
    let caller: ServingCaller | null;

    try {
      caller = await authenticate(typeof header === "string" ? header : undefined);
    } catch (error) {
      // The key cannot be checked, so nothing is served; callers continue the order without recommendations (NF-2).
      request.log.error({ err: error }, "API key check failed");
      throw new ServiceUnavailableError("API key cannot be checked. Please try again.");
    }

    if (!caller) {
      throw new UnauthorizedError("Missing or invalid API key.");
    }
    request.servingBrandId = caller.brandId;
    request.log = request.log.child({ caller: `${caller.brandId}/${caller.name}` });
  };
}

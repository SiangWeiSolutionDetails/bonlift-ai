import type { FastifyRequest } from "fastify";
import { Pool } from "pg";
import { ServiceUnavailableError, UnauthorizedError, ValidationError } from "../errors.js";
import {
  BrandApiKeyMatch,
  findLiveBrandApiKey,
  isSameApiKey,
  parseApiKeyPrefix,
} from "../services/brandApiKey.service.js";

declare module "fastify" {
  interface FastifyRequest {
    servingBrandId: string | null;
    servingApiKeyId: string | null;
    servingChannel: ServingChannel | null;
  }
}

export interface ServingChannel {
  id: string;
  code: string;
  isActive: boolean;
}

export const API_KEY_CACHE_TTL_MS = 60_000;

export interface ServingKeyAuthOptions {
  getPool: () => Pool;
  ttlMs?: number;
  now?: () => number;
}

// channel is null for keys created before channels existed.
export interface ServingCaller {
  apiKeyId: string;
  brandId: string;
  name: string;
  channel: ServingChannel | null;
}

// Only live keys are cached, so the cache is bounded by the number of keys. A revoked key keeps working
// until its entry expires (at most ttlMs); an expired key stops at once because expiresAt is checked on every hit.
// The key's channel is cached with it, so switching a channel off (or on) also takes up to ttlMs to apply.
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

    return { apiKeyId: match.id, brandId: match.brandId, name: match.name, channel: match.channel };
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
    request.servingApiKeyId = caller.apiKeyId;
    request.servingChannel = caller.channel;
    request.log = request.log.child({ caller: `${caller.brandId}/${caller.name}` });
  };
}

// Runs after the body is parsed. The key decides the channel: a body `channel` is optional, and must match it when sent.
// Keys without a channel (created before channels existed) are served as before, with `channel` ignored.
export function createServingChannelHook() {
  return async (request: FastifyRequest) => {
    const channel = request.servingChannel;
    if (!channel) return;

    if (!channel.isActive) {
      throw new ValidationError(`Channel ${channel.code} is switched off for this brand.`);
    }
    const sent = (request.body as { channel?: unknown } | undefined)?.channel;
    if (sent !== undefined && sent !== channel.code) {
      throw new ValidationError(`channel must be ${channel.code} for this API key.`);
    }
  };
}

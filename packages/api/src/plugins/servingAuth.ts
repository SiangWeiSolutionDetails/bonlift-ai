import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyBaseLogger, FastifyRequest } from "fastify";
import { UnauthorizedError } from "../errors.js";

const MIN_KEY_LENGTH = 32;

export interface ServingApiKey {
  caller: string;
  keyHash: Buffer;
}

function hashKey(key: string): Buffer {
  return createHash("sha256").update(key).digest();
}

// SERVING_API_KEYS="tqr:<key>,pos:<key>". A malformed value throws, so the API refuses to start rather than run
// with a key it misread. Only hashes are kept in memory.
export function parseServingApiKeys(raw: string | undefined): ServingApiKey[] {
  if (!raw?.trim()) return [];

  return raw.split(",").map((entry) => {
    const separator = entry.indexOf(":");
    const caller = entry.slice(0, separator).trim();
    const key = entry.slice(separator + 1).trim();

    if (separator === -1 || !caller) {
      throw new Error("SERVING_API_KEYS entries must look like caller:key.");
    }
    if (key.length < MIN_KEY_LENGTH) {
      throw new Error(
        `SERVING_API_KEYS key for ${caller} must be at least ${MIN_KEY_LENGTH} characters.`,
      );
    }
    return { caller, keyHash: hashKey(key) };
  });
}

// Equal-length hashes make timingSafeEqual usable, and every key is compared, so the response time says nothing
// about which key or how much of it matched.
export function findServingCaller(
  keys: ServingApiKey[],
  presented: string | undefined,
): string | null {
  if (!presented) return null;

  const presentedHash = hashKey(presented);
  let caller: string | null = null;

  for (const key of keys) {
    if (timingSafeEqual(key.keyHash, presentedHash)) caller = key.caller;
  }
  return caller;
}

export function createServingAuthHook(
  keys: ServingApiKey[],
  log: FastifyBaseLogger,
) {
  if (keys.length === 0) {
    log.warn("SERVING_API_KEYS is not set: every /v1 request will be rejected.");
  }

  return async (request: FastifyRequest) => {
    const header = request.headers["x-api-key"];
    const caller = findServingCaller(
      keys,
      typeof header === "string" ? header : undefined,
    );

    if (!caller) {
      throw new UnauthorizedError("Missing or invalid API key.");
    }
    request.log = request.log.child({ caller });
  };
}

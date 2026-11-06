import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { UnauthorizedError } from "../errors.js";

const BEARER_PREFIX = "bearer ";

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

// The auth scheme is case-insensitive (RFC 9110); the token itself is compared exactly.
function parseBearerToken(header: string | undefined): string | null {
  if (header?.slice(0, BEARER_PREFIX.length).toLowerCase() !== BEARER_PREFIX) return null;
  return header.slice(BEARER_PREFIX.length).trim() || null;
}

// Stopgap until admin login (H1): one shared token guards the whole admin surface.
// Both sides are hashed so timingSafeEqual always compares equal-length buffers and the length never leaks.
export function createAdminAuthHook(adminToken: string) {
  const expectedDigest = sha256(adminToken);

  return async (request: FastifyRequest) => {
    const presented = parseBearerToken(request.headers.authorization);
    if (!presented || !timingSafeEqual(sha256(presented), expectedDigest)) {
      throw new UnauthorizedError("Missing or invalid admin token.");
    }
  };
}

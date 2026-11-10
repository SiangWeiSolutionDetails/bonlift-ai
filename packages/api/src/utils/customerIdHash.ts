import { CUSTOMER_ID_HASH_PREFIX, normaliseCustomerId } from "@bonlift-ai/contracts";
import { createHmac } from "node:crypto";

export type HashedCustomerId =
  | { status: "anonymous" }
  | { status: "invalid" }
  | { status: "hashed"; id: string };

// HMAC, not a plain hash: every mobile number can be hashed and compared in minutes, so only the secret protects them.
export function hashCustomerId(secret: string, normalisedValue: string): string {
  return CUSTOMER_ID_HASH_PREFIX + createHmac("sha256", secret).update(normalisedValue).digest("hex");
}

export function toHashedCustomerId(
  secret: string,
  raw: string | null | undefined,
): HashedCustomerId {
  const normalised = normaliseCustomerId(raw);
  if (normalised.status !== "valid") {
    return normalised;
  }
  return { status: "hashed", id: hashCustomerId(secret, normalised.value) };
}

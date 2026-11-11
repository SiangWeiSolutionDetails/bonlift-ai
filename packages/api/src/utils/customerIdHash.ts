import { CUSTOMER_ID_HASH_PREFIX, normaliseCustomerId } from "@bonlift-ai/contracts";
import { createHmac } from "node:crypto";
import { ValidationError } from "../errors.js";

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

// Stored ids are hashed (CUS-02), so a /v1 request's id is hashed the same way before it is used. A malformed id is the
// caller's bug: a 400, never a silent anonymous request. The id itself is never put in the error or a log.
export function toStoredCustomerId(secret: string, customerId: string | null | undefined): string | null {
  const customer = toHashedCustomerId(secret, customerId);
  if (customer.status === "invalid") {
    throw new ValidationError(
      'customerId must be a mobile number with its country dial code and no "+" (8 to 15 digits), or an email address.',
    );
  }
  return customer.status === "hashed" ? customer.id : null;
}

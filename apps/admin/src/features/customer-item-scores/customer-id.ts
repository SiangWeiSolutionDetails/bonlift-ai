import { CUSTOMER_ID_HASH_PREFIX } from "@bonlift-ai/contracts";

const SHOWN_HEX_CHARS = 4;

// A stored id is the hash prefix plus 64 hex characters; the start and end are enough to tell customers apart.
export function shortCustomerId(customerId: string) {
  if (!customerId.startsWith(CUSTOMER_ID_HASH_PREFIX)) return customerId;

  const hex = customerId.slice(CUSTOMER_ID_HASH_PREFIX.length);
  if (hex.length <= SHOWN_HEX_CHARS * 2) return customerId;

  return `${CUSTOMER_ID_HASH_PREFIX}${hex.slice(0, SHOWN_HEX_CHARS)}…${hex.slice(-SHOWN_HEX_CHARS)}`;
}

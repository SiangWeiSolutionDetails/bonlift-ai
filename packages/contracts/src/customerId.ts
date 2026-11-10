// Customer id rules (CUS-02, D4), shared by the API and the admin. A caller sends either a mobile number with its
// country dial code and no "+" (e.g. 6591234567), or an email address. The API hashes the normalised value before
// storing or looking it up, so the plain id never reaches the database.

export const MOBILE_CUSTOMER_ID_PATTERN = /^[1-9][0-9]{7,14}$/;
// The domain is dot-separated non-empty labels with no trailing dot, so "a@b..c" and "a@b.c." are rejected.
const EMAIL_CUSTOMER_ID_PATTERN = /^[^\s@]+@(?:[^\s@.]+\.)+[^\s@.]+$/;
// Invisible format and control characters (e.g. a zero-width space) would hash differently from what the diner typed.
const INVISIBLE_CHARACTER_PATTERN = /[\p{Cf}\p{Cc}]/u;
const MAX_EMAIL_LENGTH = 254;

export type CustomerIdKind = "mobile" | "email";

export type NormalisedCustomerId =
  | { status: "anonymous" }
  | { status: "invalid" }
  | { status: "valid"; kind: CustomerIdKind; value: string };

// Missing, null or blank is anonymous. Surrounding whitespace is dropped; an email is put in Unicode NFC form and
// lower-cased, so "Tan@Mail.com" and "tan@mail.com", or a composed and a decomposed "é", are the same customer. A mobile
// number is kept exactly as its digits. Changing these rules changes the hash of ids already stored, so a change
// needs a re-hash of existing data.
export function normaliseCustomerId(raw: string | null | undefined): NormalisedCustomerId {
  const trimmed = raw?.trim() ?? "";
  if (trimmed === "") {
    return { status: "anonymous" };
  }
  if (MOBILE_CUSTOMER_ID_PATTERN.test(trimmed)) {
    return { status: "valid", kind: "mobile", value: trimmed };
  }
  const email = trimmed.normalize("NFC");
  if (email.length <= MAX_EMAIL_LENGTH && !INVISIBLE_CHARACTER_PATTERN.test(email) && EMAIL_CUSTOMER_ID_PATTERN.test(email)) {
    return { status: "valid", kind: "email", value: email.toLowerCase() };
  }
  return { status: "invalid" };
}

// Stored ids carry the hash version, so a future secret rotation can tell old and new values apart.
export const CUSTOMER_ID_HASH_PREFIX = "h1:";

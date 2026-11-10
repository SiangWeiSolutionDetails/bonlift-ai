const ADMIN_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,}$/;
const PLACEHOLDER_MARKER = "replace-with";

export function readAdminToken(): string {
  const token = process.env.ADMIN_TOKEN?.trim() ?? "";
  if (!ADMIN_TOKEN_PATTERN.test(token) || token.includes(PLACEHOLDER_MARKER)) {
    throw new Error(
      `ADMIN_TOKEN must be set to a generated token of at least 32 characters (letters, digits, "-" or "_"), not the .env.example placeholder. ` +
        `Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`,
    );
  }
  return token;
}

// Same rules as ADMIN_TOKEN. Hashes every customer id (CUS-02): changing it makes every stored id unmatchable, so it is
// set once per environment. Read once and cached, so services take it as a plain argument.
const CUSTOMER_ID_SECRET_PATTERN = ADMIN_TOKEN_PATTERN;
let customerIdSecret: string | undefined;

export function readCustomerIdSecret(): string {
  if (customerIdSecret !== undefined) return customerIdSecret;
  const secret = process.env.CUSTOMER_ID_SECRET?.trim() ?? "";
  if (!CUSTOMER_ID_SECRET_PATTERN.test(secret) || secret.includes(PLACEHOLDER_MARKER)) {
    throw new Error(
      `CUSTOMER_ID_SECRET must be set to a generated secret of at least 32 characters (letters, digits, "-" or "_"), not the .env.example placeholder. ` +
        `Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`,
    );
  }
  customerIdSecret = secret;
  return secret;
}

export function areDevRoutesEnabled(): boolean {
  return process.env.ENABLE_DEV_ROUTES === "true";
}

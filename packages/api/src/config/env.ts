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

export interface AuthConfig {
  appBaseUrl: string;
  cookieSecret: string;
  secureCookies: boolean;
  google: { clientId: string; clientSecret: string };
}

let authConfig: AuthConfig | undefined;

export function resetAuthConfigCache(): void {
  authConfig = undefined;
}

function readRequired(name: string): string {
  const value = process.env[name]?.trim() ?? "";
  if (!value) throw new Error(`${name} must be set.`);
  return value;
}

function readSessionCookieSecret(): string {
  const secret = process.env.SESSION_COOKIE_SECRET?.trim() ?? "";
  if (!ADMIN_TOKEN_PATTERN.test(secret) || secret.includes(PLACEHOLDER_MARKER)) {
    throw new Error(
      `SESSION_COOKIE_SECRET must be set to a generated secret of at least 32 characters (letters, digits, "-" or "_"), not the .env.example placeholder. ` +
        `Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`,
    );
  }
  return secret;
}

// Comparing with the parsed origin rejects any path, query, trailing slash or credentials in one check.
function readAppBaseUrl(): string {
  const value = readRequired("APP_BASE_URL");
  const parsed = URL.canParse(value) ? new URL(value) : undefined;
  const isHttp = parsed?.protocol === "http:" || parsed?.protocol === "https:";
  if (!parsed || !isHttp || parsed.origin !== value) {
    throw new Error(
      `APP_BASE_URL must be an http(s) origin with no path or trailing slash, e.g. http://localhost:5173.`,
    );
  }
  return value;
}

export function readAuthConfig(): AuthConfig {
  if (authConfig !== undefined) return authConfig;
  const appBaseUrl = readAppBaseUrl();
  authConfig = {
    appBaseUrl,
    cookieSecret: readSessionCookieSecret(),
    secureCookies: appBaseUrl.startsWith("https://"),
    google: {
      clientId: readRequired("GOOGLE_CLIENT_ID"),
      clientSecret: readRequired("GOOGLE_CLIENT_SECRET"),
    },
  };
  return authConfig;
}

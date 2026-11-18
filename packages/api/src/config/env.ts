import type { AuthProvider } from "@bonlift-ai/contracts";

const SECRET_PATTERN = /^[A-Za-z0-9_-]{32,}$/;
const PLACEHOLDER_MARKER = "replace-with";

// Hashes every customer id (CUS-02): changing it makes every stored id unmatchable, so it is
// set once per environment. Read once and cached, so services take it as a plain argument.
const CUSTOMER_ID_SECRET_PATTERN = /^[A-Za-z0-9_-]{32,}$/;
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

export interface ProviderCredentials {
  clientId: string;
  clientSecret: string;
}

export interface AuthConfig {
  appBaseUrl: string;
  cookieSecret: string;
  secureCookies: boolean;
  google: ProviderCredentials | null;
  microsoft: ProviderCredentials | null;
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

function readOptional(name: string): string {
  return process.env[name]?.trim() ?? "";
}

// Both unset turns the provider off; only one set is a typo or half-done setup, so it stops the API.
function readProviderCredentials(prefix: "GOOGLE" | "MICROSOFT", label: string): ProviderCredentials | null {
  const idName = `${prefix}_CLIENT_ID`;
  const secretName = `${prefix}_CLIENT_SECRET`;
  const clientId = readOptional(idName);
  const clientSecret = readOptional(secretName);
  if (!clientId && !clientSecret) return null;
  if (!clientId || !clientSecret) {
    const [missing, present] = clientId ? [secretName, idName] : [idName, secretName];
    throw new Error(
      `${missing} must be set when ${present} is set (set both to enable ${label} sign-in, or neither to disable it).`,
    );
  }
  return { clientId, clientSecret };
}

export function enabledAuthProviders(config: AuthConfig): Record<AuthProvider, boolean> {
  return { google: config.google !== null, microsoft: config.microsoft !== null };
}

function readSessionCookieSecret(): string {
  const secret = process.env.SESSION_COOKIE_SECRET?.trim() ?? "";
  if (!SECRET_PATTERN.test(secret) || secret.includes(PLACEHOLDER_MARKER)) {
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
    google: readProviderCredentials("GOOGLE", "Google"),
    microsoft: readProviderCredentials("MICROSOFT", "Microsoft"),
  };
  return authConfig;
}

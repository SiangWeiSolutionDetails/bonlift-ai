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

export function areDevRoutesEnabled(): boolean {
  return process.env.ENABLE_DEV_ROUTES === "true";
}

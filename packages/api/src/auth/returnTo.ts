const PARSE_BASE = "http://return-to.invalid";

// Browsers read "\" as "/" in a Location header, so "/\evil.com" means "//evil.com": no backslash is allowed.
// Resolving against a throwaway origin then catches the other off-site forms ("//x", tabs the URL parser strips).
export function safeReturnTo(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.includes("\\")) return "/";
  const parsed = URL.canParse(value, PARSE_BASE) ? new URL(value, PARSE_BASE) : undefined;
  if (!parsed || parsed.origin !== PARSE_BASE) return "/";
  // Dot segments normalise away ("/.//evil.com" becomes "//evil.com"), so the output is checked as well.
  const result = parsed.pathname + parsed.search + parsed.hash;
  return result.startsWith("//") ? "/" : result;
}

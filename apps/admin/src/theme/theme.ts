export const THEMES = ["light", "dark", "system"] as const;

export type Theme = (typeof THEMES)[number];

export type ResolvedTheme = Exclude<Theme, "system">;

export const DEFAULT_THEME: Theme = "system";

// Keep in sync with the inline pre-paint script in index.html
const STORAGE_KEY = "theme";

export const DARK_QUERY = "(prefers-color-scheme: dark)";

export function isTheme(value: unknown): value is Theme {
  return THEMES.includes(value as Theme);
}

export function readStoredTheme(): Theme | undefined {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isTheme(stored) ? stored : undefined;
  } catch {
    // Storage can throw in private mode or when blocked by policy
    return undefined;
  }
}

export function storeTheme(theme: Theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Non-fatal: the choice just won't survive a reload
  }
}

export function resolveTheme(theme: Theme, prefersDark: boolean): ResolvedTheme {
  if (theme !== "system") return theme;
  return prefersDark ? "dark" : "light";
}

export function systemPrefersDark() {
  return window.matchMedia(DARK_QUERY).matches;
}

export function applyTheme(theme: Theme) {
  const resolved = resolveTheme(theme, systemPrefersDark());
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
}

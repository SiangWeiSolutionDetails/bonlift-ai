import { useSyncExternalStore } from "react";
import {
  DARK_QUERY,
  DEFAULT_THEME,
  type ResolvedTheme,
  type Theme,
  applyTheme,
  readStoredTheme,
  resolveTheme,
  storeTheme,
  systemPrefersDark,
} from "./theme";

let currentTheme: Theme = readStoredTheme() ?? DEFAULT_THEME;
let prefersDark = systemPrefersDark();
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

window.matchMedia(DARK_QUERY).addEventListener("change", (event) => {
  prefersDark = event.matches;
  if (currentTheme === "system") applyTheme(currentTheme);
  notify();
});

export function setTheme(theme: Theme) {
  currentTheme = theme;
  storeTheme(theme);
  applyTheme(theme);
  notify();
}

export function useTheme(): { theme: Theme; resolvedTheme: ResolvedTheme; setTheme: typeof setTheme } {
  const theme = useSyncExternalStore(subscribe, () => currentTheme);
  const dark = useSyncExternalStore(subscribe, () => prefersDark);
  return { theme, resolvedTheme: resolveTheme(theme, dark), setTheme };
}

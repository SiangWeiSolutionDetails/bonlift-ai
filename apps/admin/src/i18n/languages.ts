export const SUPPORTED_LANGUAGES = ["en", "zh-CN"] as const;

export type Language = (typeof SUPPORTED_LANGUAGES)[number];

export const DEFAULT_LANGUAGE: Language = "en";

// Endonyms on purpose: a user who can't read the current UI language must still find their own.
export const LANGUAGE_LABELS: Record<Language, string> = {
  en: "English",
  "zh-CN": "简体中文",
};

const STORAGE_KEY = "language";

export function isSupportedLanguage(value: unknown): value is Language {
  return SUPPORTED_LANGUAGES.includes(value as Language);
}

// "zh", "zh-SG", "zh-Hans" → "zh-CN"; exact matches win first.
export function matchLanguage(candidate: string): Language | undefined {
  if (isSupportedLanguage(candidate)) return candidate;
  const base = candidate.toLowerCase().split("-")[0];
  return SUPPORTED_LANGUAGES.find((language) => language.toLowerCase().split("-")[0] === base);
}

export function readStoredLanguage(): Language | undefined {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isSupportedLanguage(stored) ? stored : undefined;
  } catch {
    // Storage can throw in private mode or when blocked by policy
    return undefined;
  }
}

export function storeLanguage(language: Language) {
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // Non-fatal: the choice just won't survive a reload
  }
}

export function detectLanguage(): Language {
  const stored = readStoredLanguage();
  if (stored) return stored;

  for (const candidate of navigator.languages ?? [navigator.language]) {
    const match = matchLanguage(candidate);
    if (match) return match;
  }
  return DEFAULT_LANGUAGE;
}

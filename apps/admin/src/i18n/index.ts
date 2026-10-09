import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { DEFAULT_LANGUAGE, detectLanguage, storeLanguage, type Language } from "./languages";
import { NAMESPACES, defaultNS, resources } from "./resources";

i18n.on("languageChanged", (language) => {
  document.documentElement.lang = language;
});

// Resources are bundled, so init resolves synchronously and the first render is already translated
void i18n.use(initReactI18next).init({
  resources,
  lng: detectLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: Object.keys(resources),
  ns: NAMESPACES,
  defaultNS,
  // React already escapes rendered text
  interpolation: { escapeValue: false },
});

export async function changeLanguage(language: Language) {
  await i18n.changeLanguage(language);
  storeLanguage(language);
}

export { i18n };

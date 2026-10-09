import enBrands from "./locales/en/brands.json";
import enCommon from "./locales/en/common.json";
import msBrands from "./locales/ms/brands.json";
import msCommon from "./locales/ms/common.json";
import zhCNBrands from "./locales/zh-CN/brands.json";
import zhCNCommon from "./locales/zh-CN/common.json";
import type { Language } from "./languages";

export const NAMESPACES = ["common", "brands"] as const;

export const defaultNS = "common";

export const resources = {
  en: { common: enCommon, brands: enBrands },
  "zh-CN": { common: zhCNCommon, brands: zhCNBrands },
  ms: { common: msCommon, brands: msBrands },
} satisfies Record<Language, Record<(typeof NAMESPACES)[number], object>>;

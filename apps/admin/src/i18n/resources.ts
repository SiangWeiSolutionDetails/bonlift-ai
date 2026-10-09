import enBrands from "./locales/en/brands.json";
import enCommon from "./locales/en/common.json";
import enOutlets from "./locales/en/outlets.json";
import enTenants from "./locales/en/tenants.json";
import msBrands from "./locales/ms/brands.json";
import msCommon from "./locales/ms/common.json";
import msOutlets from "./locales/ms/outlets.json";
import msTenants from "./locales/ms/tenants.json";
import zhCNBrands from "./locales/zh-CN/brands.json";
import zhCNCommon from "./locales/zh-CN/common.json";
import zhCNOutlets from "./locales/zh-CN/outlets.json";
import zhCNTenants from "./locales/zh-CN/tenants.json";
import type { Language } from "./languages";

export const NAMESPACES = ["common", "tenants", "brands", "outlets"] as const;

export const defaultNS = "common";

export const resources = {
  en: { common: enCommon, tenants: enTenants, brands: enBrands, outlets: enOutlets },
  "zh-CN": { common: zhCNCommon, tenants: zhCNTenants, brands: zhCNBrands, outlets: zhCNOutlets },
  ms: { common: msCommon, tenants: msTenants, brands: msBrands, outlets: msOutlets },
} satisfies Record<Language, Record<(typeof NAMESPACES)[number], object>>;

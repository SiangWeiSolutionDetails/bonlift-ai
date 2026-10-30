import enBrands from "./locales/en/brands.json";
import enCommon from "./locales/en/common.json";
import enOutlets from "./locales/en/outlets.json";
import enResults from "./locales/en/results.json";
import enSnapshots from "./locales/en/snapshots.json";
import enTenants from "./locales/en/tenants.json";
import zhCNBrands from "./locales/zh-CN/brands.json";
import zhCNCommon from "./locales/zh-CN/common.json";
import zhCNOutlets from "./locales/zh-CN/outlets.json";
import zhCNResults from "./locales/zh-CN/results.json";
import zhCNSnapshots from "./locales/zh-CN/snapshots.json";
import zhCNTenants from "./locales/zh-CN/tenants.json";
import type { Language } from "./languages";

export const NAMESPACES = ["common", "tenants", "brands", "outlets", "snapshots", "results"] as const;

export const defaultNS = "common";

export const resources = {
  en: { common: enCommon, tenants: enTenants, brands: enBrands, outlets: enOutlets, snapshots: enSnapshots, results: enResults },
  "zh-CN": { common: zhCNCommon, tenants: zhCNTenants, brands: zhCNBrands, outlets: zhCNOutlets, snapshots: zhCNSnapshots, results: zhCNResults },
} satisfies Record<Language, Record<(typeof NAMESPACES)[number], object>>;

import enApiKeys from "./locales/en/apiKeys.json";
import enBrands from "./locales/en/brands.json";
import enCommon from "./locales/en/common.json";
import enCustomerScores from "./locales/en/customerScores.json";
import enItemAffinity from "./locales/en/itemAffinity.json";
import enOutlets from "./locales/en/outlets.json";
import enResults from "./locales/en/results.json";
import enServingConfig from "./locales/en/servingConfig.json";
import enSnapshots from "./locales/en/snapshots.json";
import enTenants from "./locales/en/tenants.json";
import enUsage from "./locales/en/usage.json";
import zhCNApiKeys from "./locales/zh-CN/apiKeys.json";
import zhCNBrands from "./locales/zh-CN/brands.json";
import zhCNCommon from "./locales/zh-CN/common.json";
import zhCNCustomerScores from "./locales/zh-CN/customerScores.json";
import zhCNItemAffinity from "./locales/zh-CN/itemAffinity.json";
import zhCNOutlets from "./locales/zh-CN/outlets.json";
import zhCNResults from "./locales/zh-CN/results.json";
import zhCNServingConfig from "./locales/zh-CN/servingConfig.json";
import zhCNSnapshots from "./locales/zh-CN/snapshots.json";
import zhCNTenants from "./locales/zh-CN/tenants.json";
import zhCNUsage from "./locales/zh-CN/usage.json";
import type { Language } from "./languages";

export const NAMESPACES = ["common", "tenants", "brands", "outlets", "snapshots", "results", "customerScores", "itemAffinity", "servingConfig", "apiKeys", "usage"] as const;

export const defaultNS = "common";

export const resources = {
  en: { common: enCommon, tenants: enTenants, brands: enBrands, outlets: enOutlets, snapshots: enSnapshots, results: enResults, customerScores: enCustomerScores, itemAffinity: enItemAffinity, servingConfig: enServingConfig, apiKeys: enApiKeys, usage: enUsage },
  "zh-CN": { common: zhCNCommon, tenants: zhCNTenants, brands: zhCNBrands, outlets: zhCNOutlets, snapshots: zhCNSnapshots, results: zhCNResults, customerScores: zhCNCustomerScores, itemAffinity: zhCNItemAffinity, servingConfig: zhCNServingConfig, apiKeys: zhCNApiKeys, usage: zhCNUsage },
} satisfies Record<Language, Record<(typeof NAMESPACES)[number], object>>;

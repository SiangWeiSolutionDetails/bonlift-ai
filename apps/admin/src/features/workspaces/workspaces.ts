import type { AuthMeResponseSchemaType, BrandAction, ConsoleAction } from "@bonlift-ai/contracts";
// Relative, not "@/": the root vitest config has no alias, and this file is unit-tested.
import { brandsWith, canBrand, canConsole, type MeBrand } from "../auth/permissions";

type Me = AuthMeResponseSchemaType;

export type BrandWorkspace = {
  kind: "brand";
  brandId: string;
  brandName: string;
  tenantId: string;
  tenantName: string;
  roleName: string;
};
export type Workspace = { kind: "console" } | BrandWorkspace;
export type TenantWorkspaces = { tenantId: string; tenantName: string; brands: BrandWorkspace[] };

export const CONSOLE_KEY = "console";
const STORAGE_KEY = "bonlift.lastWorkspace";
const NO_ACCESS = { to: "/no-access", search: {} };

type BrandPage = {
  segment: string;
  legacyPath: string | null;
  action: BrandAction | BrandAction[];
  groupKey: "brand" | "dataset" | "computation" | "integration" | "insights";
};

export const BRAND_PAGES: BrandPage[] = [
  { segment: "outlets", legacyPath: "/outlets", action: "outlets.view", groupKey: "brand" },
  { segment: "members", legacyPath: null, action: "members.view", groupKey: "brand" },
  {
    segment: "settings",
    legacyPath: null,
    action: ["dataSource.view", "configs.view", "calculations.view", "channels.view"],
    groupKey: "brand",
  },
  { segment: "snapshots", legacyPath: "/snapshots", action: "snapshots.view", groupKey: "dataset" },
  { segment: "calculations", legacyPath: "/calculations", action: "calculations.view", groupKey: "computation" },
  { segment: "results", legacyPath: "/results", action: "results.view", groupKey: "computation" },
  { segment: "customer-scores", legacyPath: "/customer-scores", action: "customerScores.view", groupKey: "computation" },
  { segment: "item-affinity", legacyPath: "/item-affinity", action: "itemAffinity.view", groupKey: "computation" },
  { segment: "api-keys", legacyPath: "/brand-api-keys", action: "apiKeys.view", groupKey: "integration" },
  { segment: "usage", legacyPath: "/usage", action: "usage.view", groupKey: "integration" },
  { segment: "feedback", legacyPath: "/recommendation-feedback", action: "feedback.view", groupKey: "insights" },
];

export const CONSOLE_PAGES: { segment: string; legacyPath: string; action: ConsoleAction }[] = [
  { segment: "tenants", legacyPath: "/tenants", action: "tenants.view" },
  { segment: "brands", legacyPath: "/brands", action: "brands.view" },
  { segment: "users", legacyPath: "/users", action: "users.view" },
  { segment: "roles", legacyPath: "/roles", action: "roles.view" },
];

const byName = (a: string, b: string) => a.localeCompare(b);

function toBrandWorkspace(brand: MeBrand): BrandWorkspace {
  const { brandId, brandName, tenantId, tenantName, roleName } = brand;
  return { kind: "brand", brandId, brandName, tenantId, tenantName, roleName };
}

export function buildWorkspaces(me: Me) {
  const byTenant = new Map<string, TenantWorkspaces>();
  for (const brand of me.brands.map(toBrandWorkspace)) {
    const tenant = byTenant.get(brand.tenantId) ?? {
      tenantId: brand.tenantId,
      tenantName: brand.tenantName,
      brands: [],
    };
    tenant.brands.push(brand);
    byTenant.set(brand.tenantId, tenant);
  }
  const tenants = [...byTenant.values()].sort((a, b) => byName(a.tenantName, b.tenantName));
  tenants.forEach((t) => t.brands.sort((a, b) => byName(a.brandName, b.brandName)));
  const hasConsole = me.console !== null;
  return { console: hasConsole, tenants, count: tenants.reduce((n, t) => n + t.brands.length, hasConsole ? 1 : 0) };
}

export function canOpen(me: Me, workspaceKey: string) {
  if (workspaceKey === CONSOLE_KEY) return me.console !== null;
  return me.brands.some((b) => b.brandId === workspaceKey);
}

export function defaultWorkspace(me: Me, remembered: string | null): string | null {
  if (remembered && canOpen(me, remembered)) return remembered;
  if (me.console) return CONSOLE_KEY;
  return buildWorkspaces(me).tenants[0]?.brands[0]?.brandId ?? null;
}

export function readLastWorkspace(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writeLastWorkspace(key: string) {
  try {
    localStorage.setItem(STORAGE_KEY, key);
  } catch {
    // storage unavailable (private window); the workspace just isn't remembered
  }
}

function canSeeBrandPage(me: Me, brandId: string, action: BrandPage["action"]) {
  return [action].flat().some((a) => canBrand(me, brandId, a));
}

export function firstVisiblePage(me: Me, workspaceKey: string): string | null {
  if (workspaceKey === CONSOLE_KEY) {
    const page = CONSOLE_PAGES.find((p) => canConsole(me, p.action));
    return page ? `/console/${page.segment}` : null;
  }
  const page = BRAND_PAGES.find((p) => canSeeBrandPage(me, workspaceKey, p.action));
  return page && canOpen(me, workspaceKey) ? `/b/${workspaceKey}/${page.segment}` : null;
}

function rememberedBrandFor(me: Me, remembered: string | null, action: BrandAction) {
  return remembered && canBrand(me, remembered, action) ? remembered : null;
}

function legacyBrandRedirect(me: Me, page: BrandPage, search: Record<string, unknown>, remembered: string | null) {
  const { brandId, ...rest } = search;
  const action = page.action as BrandAction;
  const target =
    typeof brandId === "string" && brandId
      ? brandId
      : (rememberedBrandFor(me, remembered, action) ?? brandsWith(me, action)[0]?.brandId);
  return target ? { to: `/b/${target}/${page.segment}`, search: rest } : NO_ACCESS;
}

export function legacyRedirect(
  me: Me,
  pathname: string,
  search: Record<string, unknown>,
  remembered: string | null,
): { to: string; search: Record<string, unknown> } | null {
  const consolePage = CONSOLE_PAGES.find((p) => p.legacyPath === pathname);
  if (consolePage) return { to: `/console/${consolePage.segment}`, search };
  const brandPage = BRAND_PAGES.find((p) => p.legacyPath === pathname);
  return brandPage ? legacyBrandRedirect(me, brandPage, search, remembered) : null;
}

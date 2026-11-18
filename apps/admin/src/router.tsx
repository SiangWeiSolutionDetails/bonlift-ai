import type { ReactNode } from "react";
import {
  createRootRoute,
  createRoute,
  createRouter,
  notFound,
  Outlet,
  redirect,
  type ParsedLocation,
  type StaticDataRouteOption,
} from "@tanstack/react-router";
import {
  BarChart3Icon,
  Building2Icon,
  ChartBarIcon,
  DatabaseIcon,
  GaugeIcon,
  KeyRoundIcon,
  LayoutDashboardIcon,
  SettingsIcon,
  ShieldIcon,
  SquareStackIcon,
  StoreIcon,
  TagIcon,
  UserRoundCogIcon,
  UsersIcon,
} from "lucide-react";
import App from "@/App";
import { canBrand, hasAccess, holdsBrandRole, type RouteAccess } from "@/features/auth/permissions";
import { meQueryOptions } from "@/features/auth/queries";
import { brandDetailQueryOptions } from "@/features/brands/queries";
import { nameConfirmationRedirect, WELCOME_PATH } from "@/features/auth/name-confirmation";
import { validateLoginSearch, validateWelcomeSearch } from "@/features/auth/search";
import { resolveSettingsTab, validateSettingsSearch, visibleSettingsTabs } from "@/features/brand-settings/tabs";
import { validateUsageSearch } from "@/features/brand-usage/search";
import { validateCustomerScoresSearch } from "@/features/customer-item-scores/search";
import { validateItemAffinitySearch } from "@/features/item-affinity/search";
import { validateSnapshotsSearch } from "@/features/order-snapshots/search";
import { validateResultsSearch } from "@/features/outlet-item-scores/search";
import { BrandWorkspaceLayout } from "@/features/workspaces/components/brand-workspace-layout";
import {
  BRAND_PAGES,
  canOpen,
  CONSOLE_KEY,
  CONSOLE_PAGES,
  defaultWorkspace,
  firstVisiblePage,
  isListedWorkspace,
  legacyRedirect,
  readLastWorkspace,
  writeLastWorkspace,
} from "@/features/workspaces/workspaces";
import type enCommon from "@/i18n/locales/en/common.json";
import { ApiError } from "@/lib/api-client";
import { queryClient } from "@/lib/query-client";
import { ApiKeysPage } from "@/pages/api-keys-page";
import { BrandUsersPage } from "@/pages/brand-users-page";
import { BrandRolesPage } from "@/pages/brand-roles-page";
import { BrandSettingsPage } from "@/pages/brand-settings-page";
import { BrandsPage } from "@/pages/brands-page";
import { CalculationsPage } from "@/pages/calculations-page";
import { CustomerScoresPage } from "@/pages/customer-scores-page";
import { ItemAffinityPage } from "@/pages/item-affinity-page";
import { LoginPage } from "@/pages/login-page";
import { NoAccessPage } from "@/pages/no-access-page";
import { OrderSnapshotsPage } from "@/pages/order-snapshots-page";
import { OutletsPage } from "@/pages/outlets-page";
import { ResultsPage } from "@/pages/results-page";
import { RolesPage } from "@/pages/roles-page";
import { UsersPage } from "@/pages/users-page";
import { TenantsPage } from "@/pages/tenants-page";
import { UsagePage } from "@/pages/usage-page";
import { WelcomePage } from "@/pages/welcome-page";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Target = { to: string; search?: Record<string, unknown> };
type PageDisplay = Pick<StaticDataRouteOption, "titleKey" | "icon">;

function isUnauthorized(error: unknown) {
  return error instanceof ApiError && error.status === 401;
}

function isNotFound(error: unknown) {
  return error instanceof ApiError && error.status === 404;
}

// Every guard below runs after the _app layout's requireSession, so /auth/me is already cached
function loadMe() {
  return queryClient.ensureQueryData(meQueryOptions);
}

// Targets are built from the workspace tables at runtime, so they are not typed route paths
function redirectTo(target: Target | null) {
  return redirect({
    to: (target?.to ?? "/no-access") as "/no-access",
    search: (target?.search ?? {}) as never,
    replace: true,
  });
}

async function requireSession(location: ParsedLocation) {
  try {
    await loadMe();
  } catch (error) {
    if (!isUnauthorized(error)) throw error;
    throw redirect({ to: "/login", search: { returnTo: location.href } });
  }
}

async function requireConfirmedName(location: ParsedLocation) {
  const me = await loadMe();
  if (nameConfirmationRedirect(me, false) === WELCOME_PATH) {
    throw redirect({ to: WELCOME_PATH, search: { returnTo: location.href }, replace: true });
  }
}

async function requireUnconfirmedName() {
  const me = await loadMe();
  if (nameConfirmationRedirect(me, true) === "/") throw redirect({ to: "/", replace: true });
}

async function redirectIfSignedIn() {
  const user = await loadMe().catch(() => null);
  if (user) throw redirect({ to: "/", replace: true });
}

async function requireAccess(access: RouteAccess, brandId?: string): Promise<void> {
  const me = await loadMe();
  if (!hasAccess(me, access, brandId)) throw redirectTo(null);
}

// Preloads run beforeLoad too; only a real visit to a listed workspace (not a brand opened as provider) is remembered
async function enterWorkspace(key: string, preload: boolean) {
  const me = await loadMe();
  if (!canOpen(me, key)) throw redirectTo(null);
  if (!preload && isListedWorkspace(me, key)) writeLastWorkspace(me.id, key);
}

// Provider access opens any id, so a brand without a role must still exist; a preload only prefetches it
async function requireProviderBrand(brandId: string, preload: boolean) {
  const me = await loadMe();
  if (holdsBrandRole(me, brandId)) return;
  const brand = queryClient.ensureQueryData(brandDetailQueryOptions(brandId));
  if (preload) return void brand.catch(() => undefined);
  try {
    await brand;
  } catch (error) {
    if (isNotFound(error)) throw redirectTo(null);
    throw error;
  }
}

async function enterBrandWorkspace(brandId: string, preload: boolean) {
  if (!UUID.test(brandId)) throw redirectTo(null);
  await enterWorkspace(brandId, preload);
  await requireProviderBrand(brandId, preload);
}

async function redirectToFirstPage(key: string): Promise<never> {
  const me = await loadMe();
  const to = firstVisiblePage(me, key);
  throw redirectTo(to ? { to } : null);
}

// Only a bare "/" uses the remembered workspace; it doesn't write it, entering the workspace does
async function redirectToDefaultWorkspace(): Promise<never> {
  const me = await loadMe();
  const key = defaultWorkspace(me, readLastWorkspace(me.id));
  throw redirectTo(key ? { to: firstVisiblePage(me, key) ?? "/no-access" } : null);
}

async function redirectLegacyPath(location: ParsedLocation): Promise<never> {
  const me = await loadMe();
  const pathname = location.pathname.replace(/\/+$/, "");
  const target = legacyRedirect(me, pathname, location.search as Record<string, unknown>, readLastWorkspace(me.id));
  if (!target) throw notFound();
  throw redirectTo(target);
}

// A ?tab= that is unknown or hidden from the user is swapped for the first visible tab
async function requireVisibleSettingsTab(brandId: string, tab: string | undefined) {
  if (tab === undefined) return;
  const me = await loadMe();
  const resolved = resolveSettingsTab(tab, visibleSettingsTabs((action) => canBrand(me, brandId, action)));
  if (resolved === tab) return;
  throw redirect({ to: "/b/$brandId/settings", params: { brandId }, search: { tab: resolved }, replace: true });
}

// A direct hit on a page the sidebar hides lands on the no-access page
function consolePage(segment: string, display: PageDisplay) {
  const page = CONSOLE_PAGES.find((p) => p.segment === segment);
  if (!page) throw new Error(`Unknown console page: ${segment}`);
  const access: RouteAccess = { console: page.action };
  return {
    staticData: { ...display, groupKey: "nav.management", access } satisfies StaticDataRouteOption,
    beforeLoad: () => requireAccess(access),
  };
}

// The brand layout has already checked the brand can be opened; this checks the page's action on it
function brandPage(segment: string, display: PageDisplay) {
  const page = BRAND_PAGES.find((p) => p.segment === segment);
  if (!page) throw new Error(`Unknown brand page: ${segment}`);
  const access: RouteAccess = { brand: page.action };
  return {
    staticData: { ...display, groupKey: `nav.${page.groupKey}`, access } satisfies StaticDataRouteOption,
    beforeLoad: ({ params }: { params: { brandId: string } }) => requireAccess(access, params.brandId),
  };
}

const rootRoute = createRootRoute({ component: Outlet });

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginPage,
  validateSearch: validateLoginSearch,
  beforeLoad: redirectIfSignedIn,
});

const welcomeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: WELCOME_PATH,
  component: WelcomePage,
  validateSearch: validateWelcomeSearch,
  beforeLoad: async ({ location }) => {
    await requireSession(location);
    await requireUnconfirmedName();
  },
});

const appLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "_app",
  component: App,
  beforeLoad: async ({ location }) => {
    await requireSession(location);
    await requireConfirmedName(location);
  },
});

const indexRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/",
  beforeLoad: redirectToDefaultWorkspace,
});

const noAccessRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/no-access",
  component: NoAccessPage,
});

// Today's flat paths (/tenants, /usage?brandId=…) redirect into a workspace; anything else is not found
const legacyRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "$",
  beforeLoad: ({ location }) => redirectLegacyPath(location),
});

const consoleLayoutRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/console",
  component: Outlet,
  beforeLoad: ({ preload }) => enterWorkspace(CONSOLE_KEY, preload),
});

const consoleIndexRoute = createRoute({
  getParentRoute: () => consoleLayoutRoute,
  path: "/",
  beforeLoad: () => redirectToFirstPage(CONSOLE_KEY),
});

const tenantsRoute = createRoute({
  getParentRoute: () => consoleLayoutRoute,
  path: "tenants",
  component: TenantsPage,
  ...consolePage("tenants", { titleKey: "nav.tenants", icon: <Building2Icon /> }),
});

const brandsRoute = createRoute({
  getParentRoute: () => consoleLayoutRoute,
  path: "brands",
  component: BrandsPage,
  ...consolePage("brands", { titleKey: "nav.brands", icon: <TagIcon /> }),
});

const usersRoute = createRoute({
  getParentRoute: () => consoleLayoutRoute,
  path: "users",
  component: UsersPage,
  ...consolePage("users", { titleKey: "nav.users", icon: <UsersIcon /> }),
});

const rolesRoute = createRoute({
  getParentRoute: () => consoleLayoutRoute,
  path: "roles",
  component: RolesPage,
  ...consolePage("roles", { titleKey: "nav.roles", icon: <ShieldIcon /> }),
});

// Runs before any page guard or page load, so a brand without a role or provider access never reaches a page
const brandLayoutRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/b/$brandId",
  component: BrandWorkspaceLayout,
  beforeLoad: ({ params, preload }) => enterBrandWorkspace(params.brandId, preload),
});

const brandIndexRoute = createRoute({
  getParentRoute: () => brandLayoutRoute,
  path: "/",
  beforeLoad: ({ params }) => redirectToFirstPage(params.brandId),
});

const outletsRoute = createRoute({
  getParentRoute: () => brandLayoutRoute,
  path: "outlets",
  component: OutletsPage,
  ...brandPage("outlets", { titleKey: "nav.outlets", icon: <StoreIcon /> }),
});

const brandUsersRoute = createRoute({
  getParentRoute: () => brandLayoutRoute,
  path: "users",
  component: BrandUsersPage,
  ...brandPage("users", { titleKey: "nav.brandUsers", icon: <UserRoundCogIcon /> }),
});

const legacyBrandMembersRoute = createRoute({
  getParentRoute: () => brandLayoutRoute,
  path: "members",
  beforeLoad: ({ params, search }) => {
    throw redirect({ to: "/b/$brandId/users", params, search, replace: true });
  },
});

const brandRolesRoute = createRoute({
  getParentRoute: () => brandLayoutRoute,
  path: "roles",
  component: BrandRolesPage,
  ...brandPage("roles", { titleKey: "nav.roles", icon: <ShieldIcon /> }),
});

const settingsPage = brandPage("settings", { titleKey: "nav.settings", icon: <SettingsIcon /> });

const settingsRoute = createRoute({
  getParentRoute: () => brandLayoutRoute,
  path: "settings",
  component: BrandSettingsPage,
  validateSearch: validateSettingsSearch,
  staticData: settingsPage.staticData,
  beforeLoad: async ({ params, search }) => {
    await settingsPage.beforeLoad({ params });
    await requireVisibleSettingsTab(params.brandId, search.tab);
  },
});

const snapshotsRoute = createRoute({
  getParentRoute: () => brandLayoutRoute,
  path: "snapshots",
  component: OrderSnapshotsPage,
  validateSearch: validateSnapshotsSearch,
  ...brandPage("snapshots", { titleKey: "nav.snapshots", icon: <DatabaseIcon /> }),
});

const calculationsRoute = createRoute({
  getParentRoute: () => brandLayoutRoute,
  path: "calculations",
  component: CalculationsPage,
  ...brandPage("calculations", { titleKey: "nav.calculations", icon: <LayoutDashboardIcon /> }),
});

const resultsRoute = createRoute({
  getParentRoute: () => brandLayoutRoute,
  path: "results",
  component: ResultsPage,
  validateSearch: validateResultsSearch,
  ...brandPage("results", { titleKey: "nav.results", icon: <BarChart3Icon /> }),
});

const customerScoresRoute = createRoute({
  getParentRoute: () => brandLayoutRoute,
  path: "customer-scores",
  component: CustomerScoresPage,
  validateSearch: validateCustomerScoresSearch,
  ...brandPage("customer-scores", { titleKey: "nav.customerScores", icon: <ChartBarIcon /> }),
});

const itemAffinityRoute = createRoute({
  getParentRoute: () => brandLayoutRoute,
  path: "item-affinity",
  component: ItemAffinityPage,
  validateSearch: validateItemAffinitySearch,
  ...brandPage("item-affinity", { titleKey: "nav.itemAffinity", icon: <SquareStackIcon /> }),
});

// "/b/…/api-keys" is safe: the dev proxy and Caddy only forward paths starting with "/api/"
const apiKeysRoute = createRoute({
  getParentRoute: () => brandLayoutRoute,
  path: "api-keys",
  component: ApiKeysPage,
  ...brandPage("api-keys", { titleKey: "nav.apiKeys", icon: <KeyRoundIcon /> }),
});

const usageRoute = createRoute({
  getParentRoute: () => brandLayoutRoute,
  path: "usage",
  component: UsagePage,
  validateSearch: validateUsageSearch,
  ...brandPage("usage", { titleKey: "nav.usage", icon: <GaugeIcon /> }),
});

// Child order is the sidebar order, and matches CONSOLE_PAGES / BRAND_PAGES (the first-visible-page order)
const consoleRoutes = consoleLayoutRoute.addChildren([
  consoleIndexRoute,
  tenantsRoute,
  brandsRoute,
  usersRoute,
  rolesRoute,
]);

const brandRoutes = brandLayoutRoute.addChildren([
  brandIndexRoute,
  outletsRoute,
  brandUsersRoute,
  legacyBrandMembersRoute,
  brandRolesRoute,
  settingsRoute,
  snapshotsRoute,
  calculationsRoute,
  resultsRoute,
  customerScoresRoute,
  itemAffinityRoute,
  apiKeysRoute,
  usageRoute,
]);

const appRoutes = appLayoutRoute.addChildren([
  indexRoute,
  noAccessRoute,
  consoleRoutes,
  brandRoutes,
  legacyRoute,
]);

const routeTree = rootRoute.addChildren([loginRoute, welcomeRoute, appRoutes]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
  interface StaticDataRouteOption {
    titleKey?: `nav.${keyof typeof enCommon.nav}`;
    groupKey?: `nav.${keyof typeof enCommon.nav}`;
    icon?: ReactNode;
    access?: RouteAccess;
  }
}

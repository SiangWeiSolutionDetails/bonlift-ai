import type { ReactNode } from "react";
import {
  createRootRoute,
  createRoute,
  createRouter,
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
  ShieldIcon,
  SquareStackIcon,
  StoreIcon,
  TagIcon,
  ThumbsUpIcon,
  UsersIcon,
} from "lucide-react";
import App from "@/App";
import { hasAccess, type RouteAccess } from "@/features/auth/permissions";
import { meQueryOptions } from "@/features/auth/queries";
import { validateLoginSearch } from "@/features/auth/search";
import { validateApiKeysSearch } from "@/features/brand-api-keys/search";
import { validateUsageSearch } from "@/features/brand-usage/search";
import { validateCalculationsSearch } from "@/features/calculations-overview/search";
import { validateCustomerScoresSearch } from "@/features/customer-item-scores/search";
import { validateItemAffinitySearch } from "@/features/item-affinity/search";
import { validateSnapshotsSearch } from "@/features/order-snapshots/search";
import { validateResultsSearch } from "@/features/outlet-item-scores/search";
import { validateRecommendationFeedbackSearch } from "@/features/recommendation-feedback/search";
import type enCommon from "@/i18n/locales/en/common.json";
import { ApiError } from "@/lib/api-client";
import { queryClient } from "@/lib/query-client";
import { ApiKeysPage } from "@/pages/api-keys-page";
import { BrandsPage } from "@/pages/brands-page";
import { CalculationsPage } from "@/pages/calculations-page";
import { CustomerScoresPage } from "@/pages/customer-scores-page";
import { ItemAffinityPage } from "@/pages/item-affinity-page";
import { LoginPage } from "@/pages/login-page";
import { NoAccessPage } from "@/pages/no-access-page";
import { OrderSnapshotsPage } from "@/pages/order-snapshots-page";
import { OutletsPage } from "@/pages/outlets-page";
import { RecommendationFeedbackPage } from "@/pages/recommendation-feedback-page";
import { ResultsPage } from "@/pages/results-page";
import { RolesPage } from "@/pages/roles-page";
import { UsersPage } from "@/pages/users-page";
import { TenantsPage } from "@/pages/tenants-page";
import { UsagePage } from "@/pages/usage-page";

function isUnauthorized(error: unknown) {
  return error instanceof ApiError && error.status === 401;
}

async function requireSession(location: ParsedLocation) {
  try {
    await queryClient.ensureQueryData(meQueryOptions);
  } catch (error) {
    if (!isUnauthorized(error)) throw error;
    throw redirect({ to: "/login", search: { returnTo: location.href } });
  }
}

async function redirectIfSignedIn() {
  const user = await queryClient.ensureQueryData(meQueryOptions).catch(() => null);
  if (user) throw redirect({ to: "/", replace: true });
}

// Runs after the layout's requireSession, so /auth/me is already cached
async function requireAccess(access: RouteAccess): Promise<void> {
  const me = await queryClient.ensureQueryData(meQueryOptions);
  if (!hasAccess(me, access)) throw redirect({ to: "/no-access", replace: true });
}

// A direct hit on a page the sidebar hides lands on the no-access page
function guardedBy(staticData: StaticDataRouteOption & { access: RouteAccess }) {
  return { staticData, beforeLoad: () => requireAccess(staticData.access) };
}

async function redirectToFirstVisibleRoute(): Promise<never> {
  const me = await queryClient.ensureQueryData(meQueryOptions);
  const first = sidebarRoutes.find((route) => {
    const { access } = route.options.staticData ?? {};
    return !access || hasAccess(me, access);
  });
  throw redirect({ to: first?.fullPath ?? "/no-access", replace: true });
}

const rootRoute = createRootRoute({ component: Outlet });

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginPage,
  validateSearch: validateLoginSearch,
  beforeLoad: redirectIfSignedIn,
});

const appLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "_app",
  component: App,
  beforeLoad: ({ location }) => requireSession(location),
});

const indexRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/",
  beforeLoad: redirectToFirstVisibleRoute,
});

const noAccessRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/no-access",
  component: NoAccessPage,
});

const tenantsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/tenants",
  component: TenantsPage,
  ...guardedBy({
    titleKey: "nav.tenants",
    groupKey: "nav.management",
    icon: <Building2Icon />,
    access: { console: "tenants.view" },
  }),
});

const brandsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/brands",
  component: BrandsPage,
  ...guardedBy({
    titleKey: "nav.brands",
    groupKey: "nav.management",
    icon: <TagIcon />,
    access: { console: "brands.view", orAnyBrandRole: true },
  }),
});

const outletsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/outlets",
  component: OutletsPage,
  ...guardedBy({
    titleKey: "nav.outlets",
    groupKey: "nav.management",
    icon: <StoreIcon />,
    access: { anyBrand: "outlets.view" },
  }),
});

const rolesRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/roles",
  component: RolesPage,
  ...guardedBy({
    titleKey: "nav.roles",
    groupKey: "nav.management",
    icon: <ShieldIcon />,
    access: { console: "roles.view" },
  }),
});

const usersRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/users",
  component: UsersPage,
  ...guardedBy({
    titleKey: "nav.users",
    groupKey: "nav.management",
    icon: <UsersIcon />,
    access: { console: "users.view" },
  }),
});

const snapshotsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/snapshots",
  component: OrderSnapshotsPage,
  validateSearch: validateSnapshotsSearch,
  ...guardedBy({
    titleKey: "nav.snapshots",
    groupKey: "nav.dataset",
    icon: <DatabaseIcon />,
    access: { anyBrand: "snapshots.view" },
  }),
});

const calculationsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/calculations",
  component: CalculationsPage,
  validateSearch: validateCalculationsSearch,
  ...guardedBy({
    titleKey: "nav.calculations",
    groupKey: "nav.computation",
    icon: <LayoutDashboardIcon />,
    access: { anyBrand: "calculations.view" },
  }),
});

const resultsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/results",
  component: ResultsPage,
  validateSearch: validateResultsSearch,
  ...guardedBy({
    titleKey: "nav.results",
    groupKey: "nav.computation",
    icon: <BarChart3Icon />,
    access: { anyBrand: "results.view" },
  }),
});

const customerScoresRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/customer-scores",
  component: CustomerScoresPage,
  validateSearch: validateCustomerScoresSearch,
  ...guardedBy({
    titleKey: "nav.customerScores",
    groupKey: "nav.computation",
    icon: <ChartBarIcon />,
    access: { anyBrand: "customerScores.view" },
  }),
});

const itemAffinityRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/item-affinity",
  component: ItemAffinityPage,
  validateSearch: validateItemAffinitySearch,
  ...guardedBy({
    titleKey: "nav.itemAffinity",
    groupKey: "nav.computation",
    icon: <SquareStackIcon />,
    access: { anyBrand: "itemAffinity.view" },
  }),
});

const apiKeysRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  // Not "/api-keys": the dev proxy (and any production proxy) forwards every path starting with "/api" to the API.
  path: "/brand-api-keys",
  component: ApiKeysPage,
  validateSearch: validateApiKeysSearch,
  ...guardedBy({
    titleKey: "nav.apiKeys",
    groupKey: "nav.integration",
    icon: <KeyRoundIcon />,
    access: { anyBrand: "apiKeys.view" },
  }),
});

const usageRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/usage",
  component: UsagePage,
  validateSearch: validateUsageSearch,
  ...guardedBy({
    titleKey: "nav.usage",
    groupKey: "nav.integration",
    icon: <GaugeIcon />,
    access: { anyBrand: "usage.view" },
  }),
});

const recommendationFeedbackRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/recommendation-feedback",
  component: RecommendationFeedbackPage,
  validateSearch: validateRecommendationFeedbackSearch,
  ...guardedBy({
    titleKey: "nav.recommendationFeedback",
    groupKey: "nav.insights",
    icon: <ThumbsUpIcon />,
    access: { anyBrand: "feedback.view" },
  }),
});

// Order here is the sidebar order; routes with a staticData icon and groupKey appear in the sidebar.
const sidebarRoutes = [
  tenantsRoute,
  brandsRoute,
  outletsRoute,
  rolesRoute,
  usersRoute,
  snapshotsRoute,
  calculationsRoute,
  resultsRoute,
  customerScoresRoute,
  itemAffinityRoute,
  apiKeysRoute,
  usageRoute,
  recommendationFeedbackRoute,
] as const;

const appRoutes = appLayoutRoute.addChildren([indexRoute, noAccessRoute, ...sidebarRoutes]);

const routeTree = rootRoute.addChildren([loginRoute, appRoutes]);

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

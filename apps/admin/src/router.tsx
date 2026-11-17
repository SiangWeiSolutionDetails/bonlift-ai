import type { ReactNode } from "react";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
  type ParsedLocation,
} from "@tanstack/react-router";
import {
  BarChart3Icon,
  Building2Icon,
  ChartBarIcon,
  DatabaseIcon,
  GaugeIcon,
  KeyRoundIcon,
  LayoutDashboardIcon,
  SquareStackIcon,
  StoreIcon,
  TagIcon,
  ThumbsUpIcon,
} from "lucide-react";
import App from "@/App";
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
import { OrderSnapshotsPage } from "@/pages/order-snapshots-page";
import { OutletsPage } from "@/pages/outlets-page";
import { RecommendationFeedbackPage } from "@/pages/recommendation-feedback-page";
import { ResultsPage } from "@/pages/results-page";
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
  beforeLoad: () => {
    throw redirect({ to: "/tenants", replace: true });
  },
});

const tenantsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/tenants",
  component: TenantsPage,
  staticData: { titleKey: "nav.tenants", groupKey: "nav.management", icon: <Building2Icon /> },
});

const brandsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/brands",
  component: BrandsPage,
  staticData: { titleKey: "nav.brands", groupKey: "nav.management", icon: <TagIcon /> },
});

const outletsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/outlets",
  component: OutletsPage,
  staticData: { titleKey: "nav.outlets", groupKey: "nav.management", icon: <StoreIcon /> },
});

const snapshotsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/snapshots",
  component: OrderSnapshotsPage,
  validateSearch: validateSnapshotsSearch,
  staticData: { titleKey: "nav.snapshots", groupKey: "nav.dataset", icon: <DatabaseIcon /> },
});

const calculationsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/calculations",
  component: CalculationsPage,
  validateSearch: validateCalculationsSearch,
  staticData: { titleKey: "nav.calculations", groupKey: "nav.computation", icon: <LayoutDashboardIcon /> },
});

const resultsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/results",
  component: ResultsPage,
  validateSearch: validateResultsSearch,
  staticData: { titleKey: "nav.results", groupKey: "nav.computation", icon: <BarChart3Icon /> },
});

const customerScoresRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/customer-scores",
  component: CustomerScoresPage,
  validateSearch: validateCustomerScoresSearch,
  staticData: { titleKey: "nav.customerScores", groupKey: "nav.computation", icon: <ChartBarIcon /> },
});

const itemAffinityRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/item-affinity",
  component: ItemAffinityPage,
  validateSearch: validateItemAffinitySearch,
  staticData: { titleKey: "nav.itemAffinity", groupKey: "nav.computation", icon: <SquareStackIcon /> },
});

const apiKeysRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  // Not "/api-keys": the dev proxy (and any production proxy) forwards every path starting with "/api" to the API.
  path: "/brand-api-keys",
  component: ApiKeysPage,
  validateSearch: validateApiKeysSearch,
  staticData: { titleKey: "nav.apiKeys", groupKey: "nav.integration", icon: <KeyRoundIcon /> },
});

const usageRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/usage",
  component: UsagePage,
  validateSearch: validateUsageSearch,
  staticData: { titleKey: "nav.usage", groupKey: "nav.integration", icon: <GaugeIcon /> },
});

const recommendationFeedbackRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/recommendation-feedback",
  component: RecommendationFeedbackPage,
  validateSearch: validateRecommendationFeedbackSearch,
  staticData: {
    titleKey: "nav.recommendationFeedback",
    groupKey: "nav.insights",
    icon: <ThumbsUpIcon />,
  },
});

// Order here is the sidebar order; routes with a staticData icon and groupKey appear in the sidebar.
const appRoutes = appLayoutRoute.addChildren([
  indexRoute,
  tenantsRoute,
  brandsRoute,
  outletsRoute,
  snapshotsRoute,
  calculationsRoute,
  resultsRoute,
  customerScoresRoute,
  itemAffinityRoute,
  apiKeysRoute,
  usageRoute,
  recommendationFeedbackRoute,
]);

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
  }
}

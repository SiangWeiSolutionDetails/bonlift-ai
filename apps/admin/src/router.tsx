import type { ReactNode } from "react";
import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from "@tanstack/react-router";
import {
  BarChart3Icon,
  Building2Icon,
  ChartBarIcon,
  DatabaseIcon,
  GaugeIcon,
  KeyRoundIcon,
  SquareStackIcon,
  StoreIcon,
  TagIcon,
  ThumbsUpIcon,
} from "lucide-react";
import App from "@/App";
import { validateApiKeysSearch } from "@/features/brand-api-keys/search";
import { validateUsageSearch } from "@/features/brand-usage/search";
import { validateCustomerScoresSearch } from "@/features/customer-item-scores/search";
import { validateItemAffinitySearch } from "@/features/item-affinity/search";
import { validateSnapshotsSearch } from "@/features/order-snapshots/search";
import { validateResultsSearch } from "@/features/outlet-item-scores/search";
import { validateRecommendationFeedbackSearch } from "@/features/recommendation-feedback/search";
import type enCommon from "@/i18n/locales/en/common.json";
import { ApiKeysPage } from "@/pages/api-keys-page";
import { BrandsPage } from "@/pages/brands-page";
import { CustomerScoresPage } from "@/pages/customer-scores-page";
import { ItemAffinityPage } from "@/pages/item-affinity-page";
import { OrderSnapshotsPage } from "@/pages/order-snapshots-page";
import { OutletsPage } from "@/pages/outlets-page";
import { RecommendationFeedbackPage } from "@/pages/recommendation-feedback-page";
import { ResultsPage } from "@/pages/results-page";
import { TenantsPage } from "@/pages/tenants-page";
import { UsagePage } from "@/pages/usage-page";

const rootRoute = createRootRoute({ component: App });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/tenants", replace: true });
  },
});

const tenantsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tenants",
  component: TenantsPage,
  staticData: { titleKey: "nav.tenants", groupKey: "nav.management", icon: <Building2Icon /> },
});

const brandsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/brands",
  component: BrandsPage,
  staticData: { titleKey: "nav.brands", groupKey: "nav.management", icon: <TagIcon /> },
});

const outletsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/outlets",
  component: OutletsPage,
  staticData: { titleKey: "nav.outlets", groupKey: "nav.management", icon: <StoreIcon /> },
});

const snapshotsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/snapshots",
  component: OrderSnapshotsPage,
  validateSearch: validateSnapshotsSearch,
  staticData: { titleKey: "nav.snapshots", groupKey: "nav.dataset", icon: <DatabaseIcon /> },
});

const resultsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/results",
  component: ResultsPage,
  validateSearch: validateResultsSearch,
  staticData: { titleKey: "nav.results", groupKey: "nav.computation", icon: <BarChart3Icon /> },
});

const customerScoresRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/customer-scores",
  component: CustomerScoresPage,
  validateSearch: validateCustomerScoresSearch,
  staticData: { titleKey: "nav.customerScores", groupKey: "nav.computation", icon: <ChartBarIcon /> },
});

const itemAffinityRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/item-affinity",
  component: ItemAffinityPage,
  validateSearch: validateItemAffinitySearch,
  staticData: { titleKey: "nav.itemAffinity", groupKey: "nav.computation", icon: <SquareStackIcon /> },
});

const apiKeysRoute = createRoute({
  getParentRoute: () => rootRoute,
  // Not "/api-keys": the dev proxy (and any production proxy) forwards every path starting with "/api" to the API.
  path: "/brand-api-keys",
  component: ApiKeysPage,
  validateSearch: validateApiKeysSearch,
  staticData: { titleKey: "nav.apiKeys", groupKey: "nav.integration", icon: <KeyRoundIcon /> },
});

const usageRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/usage",
  component: UsagePage,
  validateSearch: validateUsageSearch,
  staticData: { titleKey: "nav.usage", groupKey: "nav.integration", icon: <GaugeIcon /> },
});

const recommendationFeedbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/recommendation-feedback",
  component: RecommendationFeedbackPage,
  validateSearch: validateRecommendationFeedbackSearch,
  staticData: {
    titleKey: "nav.recommendationFeedback",
    groupKey: "nav.reports",
    icon: <ThumbsUpIcon />,
  },
});

// Order here is the sidebar order; routes with a staticData icon and groupKey appear in the sidebar.
const routeTree = rootRoute.addChildren([
  indexRoute,
  tenantsRoute,
  brandsRoute,
  outletsRoute,
  snapshotsRoute,
  resultsRoute,
  customerScoresRoute,
  itemAffinityRoute,
  apiKeysRoute,
  usageRoute,
  recommendationFeedbackRoute,
]);

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

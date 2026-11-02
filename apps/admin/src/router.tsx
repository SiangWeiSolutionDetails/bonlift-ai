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
  SquareStackIcon,
  StoreIcon,
  TagIcon,
} from "lucide-react";
import App from "@/App";
import { validateCustomerScoresSearch } from "@/features/customer-item-scores/search";
import { validateItemAffinitySearch } from "@/features/item-affinity/search";
import { validateSnapshotsSearch } from "@/features/order-snapshots/search";
import { validateResultsSearch } from "@/features/outlet-item-scores/search";
import type enCommon from "@/i18n/locales/en/common.json";
import { BrandsPage } from "@/pages/brands-page";
import { CustomerScoresPage } from "@/pages/customer-scores-page";
import { ItemAffinityPage } from "@/pages/item-affinity-page";
import { OrderSnapshotsPage } from "@/pages/order-snapshots-page";
import { OutletsPage } from "@/pages/outlets-page";
import { ResultsPage } from "@/pages/results-page";
import { TenantsPage } from "@/pages/tenants-page";

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

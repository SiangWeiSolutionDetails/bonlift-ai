import type { ReactNode } from "react";
import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from "@tanstack/react-router";
import { Building2Icon, StoreIcon, TagIcon } from "lucide-react";
import App from "@/App";
import type enCommon from "@/i18n/locales/en/common.json";
import { BrandsPage } from "@/pages/brands-page";
import { OutletsPage } from "@/pages/outlets-page";
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
  staticData: { titleKey: "nav.tenants", icon: <Building2Icon /> },
});

const brandsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/brands",
  component: BrandsPage,
  staticData: { titleKey: "nav.brands", icon: <TagIcon /> },
});

const outletsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/outlets",
  component: OutletsPage,
  staticData: { titleKey: "nav.outlets", icon: <StoreIcon /> },
});

// Order here is the sidebar order; routes with a staticData icon appear in the sidebar.
const routeTree = rootRoute.addChildren([
  indexRoute,
  tenantsRoute,
  brandsRoute,
  outletsRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
  interface StaticDataRouteOption {
    titleKey?: `nav.${keyof typeof enCommon.nav}`;
    icon?: ReactNode;
  }
}

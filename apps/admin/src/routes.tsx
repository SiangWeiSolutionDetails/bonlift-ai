import type { ComponentType, ReactNode } from "react";
import { Building2Icon, StoreIcon, TagIcon } from "lucide-react";
import { BrandsPage } from "@/pages/brands-page";
import { OutletsPage } from "@/pages/outlets-page";
import { TenantsPage } from "@/pages/tenants-page";

type AppRoute = {
  path: string;
  titleKey: "nav.tenants" | "nav.brands" | "nav.outlets";
  icon: ReactNode;
  Page: ComponentType;
};

// Single source for the sidebar, breadcrumb and page. Interim exact-path matching until a router is
// added, so sidebar links do full page loads.
export const ROUTES: AppRoute[] = [
  { path: "/tenants", titleKey: "nav.tenants", icon: <Building2Icon />, Page: TenantsPage },
  { path: "/brands", titleKey: "nav.brands", icon: <TagIcon />, Page: BrandsPage },
  { path: "/outlets", titleKey: "nav.outlets", icon: <StoreIcon />, Page: OutletsPage },
];

const DEFAULT_ROUTE = ROUTES[0];

export function matchRoute(pathname: string) {
  const normalized = pathname.replace(/\/+$/, "");
  return ROUTES.find((route) => route.path === normalized) ?? DEFAULT_ROUTE;
}

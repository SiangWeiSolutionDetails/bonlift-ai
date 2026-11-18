import { getRouteApi, useMatches } from "@tanstack/react-router";
import { useCurrentUser } from "@/features/auth/queries";
import { CONSOLE_KEY, toBrandWorkspace, type Workspace } from "./workspaces";

export const CONSOLE_ROUTE_ID = "/_app/console";
export const BRAND_ROUTE_ID = "/_app/b/$brandId";

const brandWorkspaceRoute = getRouteApi(BRAND_ROUTE_ID);

// Only for components inside the brand workspace; the layout guard has already checked the brand
export function useWorkspaceBrandId() {
  return brandWorkspaceRoute.useParams({ select: (params) => params.brandId });
}

function useWorkspaceKey() {
  return useMatches({
    select: (matches) => {
      for (const match of matches) {
        if (match.routeId === CONSOLE_ROUTE_ID) return CONSOLE_KEY;
        if (match.routeId === BRAND_ROUTE_ID) return match.params.brandId;
      }
      return null;
    },
  });
}

export function useCurrentWorkspace(): Workspace | null {
  const me = useCurrentUser();
  const key = useWorkspaceKey();
  if (key === CONSOLE_KEY) return { kind: "console" };
  const brand = me.brands.find((b) => b.brandId === key);
  return brand ? toBrandWorkspace(brand) : null;
}

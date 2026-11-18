import { getRouteApi, useMatches } from "@tanstack/react-router";
import { useCurrentUser } from "@/features/auth/queries";
import { useBrand } from "@/features/brands/queries";
import type { BrandDetail } from "@/features/brands/type";
import { brandWorkspaceSource, CONSOLE_KEY, toBrandWorkspace, type BrandWorkspace, type Workspace } from "./workspaces";

export const CONSOLE_ROUTE_ID = "/_app/console";
export const BRAND_ROUTE_ID = "/_app/b/$brandId";

const brandWorkspaceRoute = getRouteApi(BRAND_ROUTE_ID);

// Only for components inside the brand workspace; the layout guard has already checked the brand
export function useWorkspaceBrandId() {
  return brandWorkspaceRoute.useParams({ select: (params) => params.brandId });
}

export function useWorkspaceKey() {
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

function toProviderWorkspace(brand: BrandDetail): BrandWorkspace {
  const { id, name, tenantId, tenantName } = brand;
  return { kind: "brand", brandId: id, brandName: name, tenantId, tenantName, roleName: null };
}

export type BrandWorkspaceInfo = {
  workspace: BrandWorkspace | null;
  viaProvider: boolean;
  isPending: boolean;
};

// A brand opened as the service provider isn't in me.brands, so its name and tenant are read from the API
export function useBrandWorkspaceInfo(brandId: string | undefined): BrandWorkspaceInfo {
  const me = useCurrentUser();
  const source = brandId ? brandWorkspaceSource(me, brandId) : null;
  const { data, isPending } = useBrand(source === "provider" ? brandId : undefined);
  const held = source === "role" ? me.brands.find((b) => b.brandId === brandId) : undefined;
  if (held) return { workspace: toBrandWorkspace(held), viaProvider: false, isPending: false };
  if (source !== "provider") return { workspace: null, viaProvider: false, isPending: false };
  return { workspace: data ? toProviderWorkspace(data) : null, viaProvider: true, isPending };
}

export function useCurrentWorkspaceInfo(): { workspace: Workspace | null; isPending: boolean } {
  const key = useWorkspaceKey();
  const brandInfo = useBrandWorkspaceInfo(key && key !== CONSOLE_KEY ? key : undefined);
  if (key === CONSOLE_KEY) return { workspace: { kind: "console" }, isPending: false };
  return brandInfo;
}

export function useCurrentWorkspace(): Workspace | null {
  return useCurrentWorkspaceInfo().workspace;
}

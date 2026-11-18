import { Outlet } from "@tanstack/react-router";
import { useBrandWorkspaceInfo, useWorkspaceBrandId } from "../use-workspace";
import { ProviderBanner } from "./provider-banner";

// key: switching brands remounts the page, so no state carries over from the previous brand
export function BrandWorkspaceLayout() {
  const brandId = useWorkspaceBrandId();
  const { workspace, viaProvider, isPending } = useBrandWorkspaceInfo(brandId);
  return (
    <>
      {viaProvider && <ProviderBanner workspace={workspace} isPending={isPending} />}
      <Outlet key={brandId} />
    </>
  );
}

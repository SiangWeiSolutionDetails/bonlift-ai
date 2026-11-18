import { Outlet } from "@tanstack/react-router";
import { useWorkspaceBrandId } from "../use-workspace";

// key: switching brands remounts the page, so no state carries over from the previous brand
export function BrandWorkspaceLayout() {
  const brandId = useWorkspaceBrandId();
  return <Outlet key={brandId} />;
}

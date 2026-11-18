import { useMemo } from "react";
import { usePermissions } from "@/features/auth/permissions";
import { RolesView } from "@/features/roles/components/roles-view";
import { brandScope } from "@/features/roles/type";
import { useWorkspaceBrandId } from "@/features/workspaces/use-workspace";

export function BrandRolesPage() {
  const brandId = useWorkspaceBrandId();
  const { canBrand } = usePermissions();
  const scope = useMemo(() => brandScope(brandId), [brandId]);
  return <RolesView key={brandId} scope={scope} canManage={canBrand(brandId, "brandRoles.manage")} />;
}

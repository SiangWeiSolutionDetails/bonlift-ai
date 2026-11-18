import { useCurrentUser } from "@/features/auth/queries";
import { holdsBrandAction } from "@/features/roles/role-access";
import { useBrandRoleOptions } from "./queries";
import type { BrandUser } from "./type";

export type RoleOption = { id: string; name: string };

export function useRoleOptions(brandUsers: BrandUser[], brandId: string): RoleOption[] {
  const me = useCurrentUser();
  const { data: roles } = useBrandRoleOptions(brandId, holdsBrandAction(me, brandId, "brandRoles.view"));
  if (roles) return roles;

  const known = new Map<string, RoleOption>();
  const own = me.brands.find((brand) => brand.brandId === brandId);
  if (own) known.set(own.roleId, { id: own.roleId, name: own.roleName });
  for (const brandUser of brandUsers) {
    known.set(brandUser.roleId, { id: brandUser.roleId, name: brandUser.roleName });
  }
  return [...known.values()];
}

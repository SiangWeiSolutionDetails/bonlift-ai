import { useCurrentUser } from "@/features/auth/queries";
import { holdsBrandAction } from "@/features/roles/role-access";
import { useBrandRoleOptions } from "./queries";
import type { BrandMember } from "./type";

export type RoleOption = { id: string; name: string };

export function useRoleOptions(members: BrandMember[], brandId: string): RoleOption[] {
  const me = useCurrentUser();
  const { data: roles } = useBrandRoleOptions(brandId, holdsBrandAction(me, brandId, "brandRoles.view"));
  if (roles) return roles;

  const known = new Map<string, RoleOption>();
  const own = me.brands.find((brand) => brand.brandId === brandId);
  if (own) known.set(own.roleId, { id: own.roleId, name: own.roleName });
  for (const member of members) {
    known.set(member.roleId, { id: member.roleId, name: member.roleName });
  }
  return [...known.values()];
}

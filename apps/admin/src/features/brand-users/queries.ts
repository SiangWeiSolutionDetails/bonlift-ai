import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { meQueryOptions } from "@/features/auth/queries";
import { brandKeys } from "@/features/brands/queries";
import { roleKeys, useRoles } from "@/features/roles/queries";
import { brandScope } from "@/features/roles/type";
import { removeBrandRole, setBrandRole } from "@/features/users/api";
import { userKeys } from "@/features/users/queries";
import { addBrandUser, listBrandUsers } from "./api";
import type { AddBrandUserInput } from "./type";

export const brandUserKeys = {
  list: (brandId: string) => [...brandKeys.detail(brandId), "brandUsers"] as const,
};

export function useBrandUsers(brandId: string) {
  return useQuery({
    queryKey: brandUserKeys.list(brandId),
    queryFn: ({ signal }) => listBrandUsers(brandId, signal),
  });
}

// The brand's tenant's roles, only for users who may read them; others fall back to the roles already visible to them
export function useBrandRoleOptions(brandId: string, enabled: boolean) {
  return useRoles(brandScope(brandId), enabled);
}

// Brand users also show on the users list and per-user brand roles, and feed role assignment counts
function useInvalidateBrandUsers(brandId: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: brandUserKeys.list(brandId) }),
      queryClient.invalidateQueries({ queryKey: userKeys.all }),
      queryClient.invalidateQueries({ queryKey: roleKeys.all }),
      queryClient.invalidateQueries({ queryKey: meQueryOptions.queryKey }),
    ]);
}

export function useAddBrandUser(brandId: string) {
  const invalidate = useInvalidateBrandUsers(brandId);
  return useMutation({
    mutationFn: (input: AddBrandUserInput) => addBrandUser(brandId, input),
    onSuccess: invalidate,
  });
}

export function useChangeBrandUserRole(brandId: string) {
  const invalidate = useInvalidateBrandUsers(brandId);
  return useMutation({
    mutationFn: ({ userId, roleId }: { userId: string; roleId: string }) =>
      setBrandRole(brandId, userId, roleId),
    onSuccess: invalidate,
  });
}

export function useRemoveBrandUser(brandId: string) {
  const invalidate = useInvalidateBrandUsers(brandId);
  return useMutation({
    mutationFn: (userId: string) => removeBrandRole(brandId, userId),
    onSuccess: invalidate,
  });
}

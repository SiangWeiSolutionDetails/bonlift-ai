import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { meQueryOptions } from "@/features/auth/queries";
import { brandKeys } from "@/features/brands/queries";
import { listRoles } from "@/features/roles/api";
import { roleKeys } from "@/features/roles/queries";
import { removeBrandRole, setBrandRole } from "@/features/users/api";
import { userKeys } from "@/features/users/queries";
import { addBrandMember, listBrandMembers } from "./api";
import type { AddBrandMemberInput } from "./type";

export const brandMemberKeys = {
  list: (brandId: string) => [...brandKeys.detail(brandId), "members"] as const,
};

export function useBrandMembers(brandId: string) {
  return useQuery({
    queryKey: brandMemberKeys.list(brandId),
    queryFn: ({ signal }) => listBrandMembers(brandId, signal),
  });
}

// Only for users who may read roles; others fall back to the roles already visible to them
export function useBrandRoleOptions(enabled: boolean) {
  return useQuery({
    queryKey: roleKeys.list("brand"),
    queryFn: ({ signal }) => listRoles("brand", signal),
    enabled,
  });
}

// Members also show on the users list and per-user brand roles, and feed role assignment counts
function useInvalidateMembers(brandId: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: brandMemberKeys.list(brandId) }),
      queryClient.invalidateQueries({ queryKey: userKeys.all }),
      queryClient.invalidateQueries({ queryKey: roleKeys.all }),
      queryClient.invalidateQueries({ queryKey: meQueryOptions.queryKey }),
    ]);
}

export function useAddBrandMember(brandId: string) {
  const invalidate = useInvalidateMembers(brandId);
  return useMutation({
    mutationFn: (input: AddBrandMemberInput) => addBrandMember(brandId, input),
    onSuccess: invalidate,
  });
}

export function useChangeBrandMemberRole(brandId: string) {
  const invalidate = useInvalidateMembers(brandId);
  return useMutation({
    mutationFn: ({ userId, roleId }: { userId: string; roleId: string }) =>
      setBrandRole(brandId, userId, roleId),
    onSuccess: invalidate,
  });
}

export function useRemoveBrandMember(brandId: string) {
  const invalidate = useInvalidateMembers(brandId);
  return useMutation({
    mutationFn: (userId: string) => removeBrandRole(brandId, userId),
    onSuccess: invalidate,
  });
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createRole, deleteRole, listRoles, updateRole } from "./api";
import type { RoleKindType, UpdateRoleInput } from "./type";

export const roleKeys = {
  all: ["roles"] as const,
  list: (kind: RoleKindType) => [...roleKeys.all, "list", kind] as const,
};

export function useRoles(kind: RoleKindType) {
  return useQuery({
    queryKey: roleKeys.list(kind),
    queryFn: ({ signal }) => listRoles(kind, signal),
  });
}

// Role actions also feed /auth/me, so a change can alter what the current user sees
function useInvalidateRoles() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries();
}

export function useCreateRole() {
  const invalidate = useInvalidateRoles();
  return useMutation({ mutationFn: createRole, onSuccess: invalidate });
}

export function useUpdateRole() {
  const invalidate = useInvalidateRoles();
  return useMutation({
    mutationFn: ({ roleId, input }: { roleId: string; input: UpdateRoleInput }) =>
      updateRole(roleId, input),
    onSuccess: invalidate,
  });
}

export function useDeleteRole() {
  const invalidate = useInvalidateRoles();
  return useMutation({ mutationFn: deleteRole, onSuccess: invalidate });
}

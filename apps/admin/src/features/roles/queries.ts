import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { meQueryOptions } from "@/features/auth/queries";
import { createRole, deleteRole, listRoleAssignments, listRoles, updateRole } from "./api";
import type { RoleKindType, UpdateRoleInput } from "./type";

export const roleKeys = {
  all: ["roles"] as const,
  list: (kind: RoleKindType) => [...roleKeys.all, "list", kind] as const,
  assignments: (roleId: string) => [...roleKeys.all, "assignments", roleId] as const,
};

export function useRoles(kind: RoleKindType, enabled = true) {
  return useQuery({
    queryKey: roleKeys.list(kind),
    queryFn: ({ signal }) => listRoles(kind, signal),
    enabled,
  });
}

export function useRoleAssignments(roleId: string, enabled: boolean) {
  return useQuery({
    queryKey: roleKeys.assignments(roleId),
    queryFn: ({ signal }) => listRoleAssignments(roleId, signal),
    enabled,
  });
}

// Role actions also feed /auth/me, so a change can alter what the current user sees
function useInvalidateRoles() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: roleKeys.all });
    void queryClient.invalidateQueries({ queryKey: meQueryOptions.queryKey });
  };
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

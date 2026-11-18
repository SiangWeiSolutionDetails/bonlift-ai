import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { meQueryOptions } from "@/features/auth/queries";
import { createRole, deleteRole, listRoleAssignments, listRoles, updateRole } from "./api";
import type { CreateRoleInput, RoleScope, UpdateRoleInput } from "./type";

const scopeKey = (scope: RoleScope) =>
  scope.kind === "console" ? (["console"] as const) : (["brand", scope.brandId] as const);

export const roleKeys = {
  all: ["roles"] as const,
  list: (scope: RoleScope) => [...roleKeys.all, "list", ...scopeKey(scope)] as const,
  assignments: (scope: RoleScope, roleId: string) =>
    [...roleKeys.all, "assignments", ...scopeKey(scope), roleId] as const,
};

export function useRoles(scope: RoleScope, enabled = true) {
  return useQuery({
    queryKey: roleKeys.list(scope),
    queryFn: ({ signal }) => listRoles(scope, signal),
    enabled,
  });
}

export function useRoleAssignments(scope: RoleScope, roleId: string, enabled: boolean) {
  return useQuery({
    queryKey: roleKeys.assignments(scope, roleId),
    queryFn: ({ signal }) => listRoleAssignments(scope, roleId, signal),
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

export function useCreateRole(scope: RoleScope) {
  const invalidate = useInvalidateRoles();
  return useMutation({
    mutationFn: (input: CreateRoleInput) => createRole(scope, input),
    onSuccess: invalidate,
  });
}

export function useUpdateRole(scope: RoleScope) {
  const invalidate = useInvalidateRoles();
  return useMutation({
    mutationFn: ({ roleId, input }: { roleId: string; input: UpdateRoleInput }) =>
      updateRole(scope, roleId, input),
    onSuccess: invalidate,
  });
}

export function useDeleteRole(scope: RoleScope) {
  const invalidate = useInvalidateRoles();
  return useMutation({
    mutationFn: (roleId: string) => deleteRole(scope, roleId),
    onSuccess: invalidate,
  });
}

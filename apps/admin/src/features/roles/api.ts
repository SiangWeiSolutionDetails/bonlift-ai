import { apiRequest } from "@/lib/api-client";
import type { CreateRoleInput, Role, RoleAssignment, RoleScope, UpdateRoleInput } from "./type";

function rolesPath(scope: RoleScope) {
  return scope.kind === "console" ? "/roles" : `/brands/${encodeURIComponent(scope.brandId)}/roles`;
}

function rolePath(scope: RoleScope, roleId: string) {
  return `${rolesPath(scope)}/${encodeURIComponent(roleId)}`;
}

export async function listRoles(scope: RoleScope, signal: AbortSignal) {
  const data = await apiRequest<{ roles: Role[] }>(rolesPath(scope), { signal });
  return data.roles;
}

export async function listRoleAssignments(scope: RoleScope, roleId: string, signal: AbortSignal) {
  return await apiRequest<RoleAssignment[]>(`${rolePath(scope, roleId)}/assignments`, { signal });
}

export async function createRole(scope: RoleScope, input: CreateRoleInput) {
  return await apiRequest<Role>(rolesPath(scope), { method: "POST", body: input });
}

export async function updateRole(scope: RoleScope, roleId: string, input: UpdateRoleInput) {
  return await apiRequest<Role>(rolePath(scope, roleId), { method: "PATCH", body: input });
}

export async function deleteRole(scope: RoleScope, roleId: string) {
  return await apiRequest<void>(rolePath(scope, roleId), { method: "DELETE" });
}

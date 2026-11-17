import { apiRequest } from "@/lib/api-client";
import type { CreateRoleInput, Role, RoleKindType, UpdateRoleInput } from "./type";

export async function listRoles(kind: RoleKindType, signal: AbortSignal) {
  const data = await apiRequest<{ roles: Role[] }>("/roles", { query: { kind }, signal });
  return data.roles;
}

export async function createRole(input: CreateRoleInput) {
  return await apiRequest<Role>("/roles", { method: "POST", body: input });
}

export async function updateRole(roleId: string, input: UpdateRoleInput) {
  return await apiRequest<Role>(`/roles/${encodeURIComponent(roleId)}`, {
    method: "PATCH",
    body: input,
  });
}

export async function deleteRole(roleId: string) {
  return await apiRequest<void>(`/roles/${encodeURIComponent(roleId)}`, { method: "DELETE" });
}

import type {
  RoleAssignmentRecordSchemaType,
  CreateRoleBodySchemaType,
  RoleRecordSchemaType,
  UpdateRoleBodySchemaType,
} from "@bonlift-ai/contracts";

export type RoleAssignment = RoleAssignmentRecordSchemaType;
export type Role = RoleRecordSchemaType;
export type CreateRoleInput = CreateRoleBodySchemaType;
export type UpdateRoleInput = UpdateRoleBodySchemaType;

// Console roles live under /roles; brand roles belong to a tenant and are reached through one of its brands
export type RoleScope = { kind: "console" } | { kind: "brand"; brandId: string };

export const CONSOLE_SCOPE: RoleScope = { kind: "console" };

export const brandScope = (brandId: string): RoleScope => ({ kind: "brand", brandId });

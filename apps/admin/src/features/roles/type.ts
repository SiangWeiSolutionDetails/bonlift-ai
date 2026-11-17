import type {
  CreateRoleBodySchemaType,
  RoleKind,
  RoleRecordSchemaType,
  UpdateRoleBodySchemaType,
} from "@bonlift-ai/contracts";

export type Role = RoleRecordSchemaType;
export type RoleKindType = RoleKind;
export type CreateRoleInput = CreateRoleBodySchemaType;
export type UpdateRoleInput = UpdateRoleBodySchemaType;

import Type, { type Static } from "typebox";
import { NameSchema } from "./name.schema.js";

export const RoleKindSchema = Type.Union([Type.Literal("console"), Type.Literal("brand")]);
export type RoleKind = Static<typeof RoleKindSchema>;

const ActionListSchema = Type.Array(Type.String({ minLength: 1 }), { uniqueItems: true });

export const RoleRecordSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    name: Type.String(),
    kind: RoleKindSchema,
    isBuiltin: Type.Boolean(),
    actions: Type.Array(Type.String()),
    assignmentCount: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);
export type RoleRecordSchemaType = Static<typeof RoleRecordSchema>;

export const RoleListSchema = Type.Object({
  roles: Type.Array(RoleRecordSchema),
});
export type RoleListSchemaType = Static<typeof RoleListSchema>;

export const RoleQuerySchema = Type.Object(
  {
    kind: Type.Optional(RoleKindSchema),
  },
  { additionalProperties: false },
);
export type RoleQuerySchemaType = Static<typeof RoleQuerySchema>;

export const RoleParamsSchema = Type.Object({
  roleId: Type.String({ format: "uuid" }),
});
export type RoleParamsSchemaType = Static<typeof RoleParamsSchema>;

export const CreateRoleBodySchema = Type.Object(
  {
    name: NameSchema,
    kind: RoleKindSchema,
    actions: ActionListSchema,
  },
  { additionalProperties: false },
);
export type CreateRoleBodySchemaType = Static<typeof CreateRoleBodySchema>;

export const UpdateRoleBodySchema = Type.Object(
  {
    name: Type.Optional(NameSchema),
    actions: Type.Optional(ActionListSchema),
  },
  { additionalProperties: false, minProperties: 1 },
);
export type UpdateRoleBodySchemaType = Static<typeof UpdateRoleBodySchema>;

export const RoleAssignmentRecordSchema = Type.Object(
  {
    userId: Type.String({ format: "uuid" }),
    email: Type.String(),
    displayName: Type.Union([Type.String(), Type.Null()]),
    status: Type.Union([Type.Literal("invited"), Type.Literal("active"), Type.Literal("disabled")]),
    brandId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
    brandName: Type.Union([Type.String(), Type.Null()]),
    tenantName: Type.Union([Type.String(), Type.Null()]),
  },
  { additionalProperties: false },
);
export type RoleAssignmentRecordSchemaType = Static<typeof RoleAssignmentRecordSchema>;

export const RoleAssignmentListSchema = Type.Array(RoleAssignmentRecordSchema);
export type RoleAssignmentListSchemaType = Static<typeof RoleAssignmentListSchema>;

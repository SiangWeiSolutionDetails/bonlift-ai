import Type, { type Static } from "typebox";

export const TenantRecordSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    name: Type.String(),
    isActive: Type.Boolean(),
  },
  { additionalProperties: false },
);
export type TenantRecordSchemaType = Static<typeof TenantRecordSchema>;

export const TenantListSchema = Type.Object({
  tenants: Type.Array(TenantRecordSchema),
});
export type TenantListSchemaType = Static<typeof TenantListSchema>;

export const TenantQuerySchema = Type.Object(
  {},
  { additionalProperties: false },
);
export type TenantQuerySchemaType = Static<typeof TenantQuerySchema>;

export const TenantParamsSchema = Type.Object({
  tenantId: Type.String({ format: "uuid" }),
});
export type TenantParamsSchemaType = Static<typeof TenantParamsSchema>;

export const CreateTenantBodySchema = Type.Object(
  {
    name: Type.String({ minLength: 1, maxLength: 255 }),
  },
  { additionalProperties: false },
);
export type CreateTenantBodySchemaType = Static<typeof CreateTenantBodySchema>;

export const UpdateTenantBodySchema = Type.Object(
  {
    name: Type.Optional(Type.String({ minLength: 1, maxLength: 255 })),
    isActive: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false, minProperties: 1 },
);
export type UpdateTenantBodySchemaType = Static<typeof UpdateTenantBodySchema>;

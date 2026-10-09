import Type, { type Static } from "typebox";

export const BrandRecordSchema = Type.Object(
  {
    id: Type.String(),
    tenantId: Type.String({ format: "uuid" }),
    externalId: Type.String(),
    name: Type.String(),
    isActive: Type.Boolean(),
  },
  {
    additionalProperties: false,
  },
);
export type BrandRecordSchemaType = Static<typeof BrandRecordSchema>;

export const BrandListSchema = Type.Object({
  brands: Type.Array(BrandRecordSchema),
});
export type BrandListSchemaType = Static<typeof BrandListSchema>;

export const BrandQuerySchema = Type.Object(
  {
    tenantId: Type.Optional(Type.String({ format: "uuid" })),
  },
  { additionalProperties: false },
);
export type BrandQuerySchemaType = Static<typeof BrandQuerySchema>;

export const BrandParamsSchema = Type.Object({
  brandId: Type.String({ format: "uuid" }),
});
export type BrandParamsSchemaType = Static<typeof BrandParamsSchema>;

export const CreateBrandBodySchema = Type.Object(
  {
    tenantId: Type.String({ format: "uuid" }),
    externalId: Type.String({ minLength: 1, maxLength: 255 }),
    name: Type.String({ minLength: 1, maxLength: 255 }),
  },
  { additionalProperties: false },
);
export type CreateBrandBodySchemaType = Static<typeof CreateBrandBodySchema>;

export const UpdateBrandBodySchema = Type.Object(
  {
    name: Type.Optional(Type.String({ minLength: 1, maxLength: 255 })),
    isActive: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false, minProperties: 1 },
);
export type UpdateBrandBodySchemaType = Static<typeof UpdateBrandBodySchema>;

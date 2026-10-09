import Type, { Static } from "typebox";

export const OutletRecordSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    brandId: Type.String({ format: "uuid" }),
    externalId: Type.String(),
    name: Type.String(),
    isActive: Type.Boolean(),
  },
  { additionalProperties: false },
);
export type OutletRecordSchemaType = Static<typeof OutletRecordSchema>;

export const OutletListSchema = Type.Object({
  outlets: Type.Array(OutletRecordSchema),
});
export type OutletListSchemaType = Static<typeof OutletListSchema>;

export const OutletParamsSchema = Type.Object({
  outletId: Type.String({ format: "uuid" }),
});
export type OutletParamsSchemaType = Static<typeof OutletParamsSchema>;

export const OutletQuerySchema = Type.Object(
  {
    brandId: Type.Optional(Type.String({ format: "uuid" })),
  },
  { additionalProperties: false },
);
export type OutletQuerySchemaType = Static<typeof OutletQuerySchema>;

export const CreateOutletBodySchema = Type.Object(
  {
    brandId: Type.String({ format: "uuid" }),
    externalId: Type.String({ minLength: 1, maxLength: 255 }),
    name: Type.String({ minLength: 1, maxLength: 255 }),
  },
  {
    additionalProperties: false,
  },
);
export type CreateOutletBodySchemaType = Static<typeof CreateOutletBodySchema>;

export const UpdateOutletBodySchema = Type.Object(
  {
    name: Type.Optional(Type.String({ minLength: 1, maxLength: 255 })),
    isActive: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false, minProperties: 1 },
);
export type UpdateOutletBodySchemaType = Static<typeof UpdateOutletBodySchema>;

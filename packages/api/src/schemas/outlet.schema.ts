import Type, { Static } from "typebox";

export const OutletRecordSchema = Type.Object({
  id: Type.String({ format: "uuid" }),
  name: Type.String(),
  brandId: Type.String({ format: "uuid" }),
  isActive: Type.Boolean(),
});
export type OutletRecordSchemaType = Static<typeof OutletRecordSchema>;

export const OutletListSchema = Type.Object({
  outlets: Type.Array(OutletRecordSchema),
});
export type OutletListSchemaType = Static<typeof OutletListSchema>;

export const OutletParamsSchema = Type.Object({
  outletId: Type.String({ format: "uuid" }),
});
export type OutletParamsSchemaType = Static<typeof OutletParamsSchema>;

export const OutletQuerySchema = Type.Object({
  brandId: Type.Optional(Type.String({ format: "uuid" })),
});
export type OutletQuerySchemaType = Static<typeof OutletQuerySchema>;

export const CreateOutletBodySchema = Type.Object(
  {
    name: Type.String({ minLength: 1, maxLength: 255 }),
    brandId: Type.String({ format: "uuid", minLength: 1 }),
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

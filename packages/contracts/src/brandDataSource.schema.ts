import Type, { Static } from "typebox";

export const BrandDataSourceRecordSchema = Type.Object(
  {
    brandId: Type.String({ format: "uuid" }),
    url: Type.Union([Type.String(), Type.Null()]),
    timeoutMs: Type.Integer({ minimum: 1000, maximum: 120000 }),
    refetchDays: Type.Integer({ minimum: 0 }),
    maxChunkDays: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false },
);
export type BrandDataSourceRecordSchemaType = Static<
  typeof BrandDataSourceRecordSchema
>;

export const UpdateBrandDataSourceBodySchema = Type.Object(
  {
    url: Type.Optional(
      Type.String({ pattern: "^https?://[^/?#@ ]+([/?][^# ]*)?$" }),
    ),
    timeoutMs: Type.Optional(Type.Integer({ minimum: 1000, maximum: 120000 })),
    refetchDays: Type.Optional(Type.Integer({ minimum: 0 })),
    maxChunkDays: Type.Optional(Type.Integer({ minimum: 1 })),
  },
  { additionalProperties: false, minProperties: 1 },
);
export type UpdateBrandDataSourceBodySchemaType = Static<
  typeof UpdateBrandDataSourceBodySchema
>;

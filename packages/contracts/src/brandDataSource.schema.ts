import Type, { Static } from "typebox";

export const BrandDataSourceRecordSchema = Type.Object(
  {
    brandId: Type.String({ format: "uuid" }),
    url: Type.Union([Type.String(), Type.Null()]),
    timeoutMs: Type.Integer({ minimum: 1000, maximum: 120000 }),
    refetchDays: Type.Integer({ minimum: 0, maximum: 92 }),
    maxChunkDays: Type.Integer({ minimum: 1, maximum: 92 }),
  },
  { additionalProperties: false },
);
export type BrandDataSourceRecordSchemaType = Static<
  typeof BrandDataSourceRecordSchema
>;

export const BrandDataSourceBodySchema = Type.Object(
  {
    url: Type.Optional(
      Type.String({ pattern: "^https?://[^/?#@ ]+([/?][^# ]*)?$" }),
    ),
    timeoutMs: Type.Optional(Type.Integer({ minimum: 1000, maximum: 120000 })),
    refetchDays: Type.Optional(Type.Integer({ minimum: 0, maximum: 92 })),
    maxChunkDays: Type.Optional(Type.Integer({ minimum: 1, maximum: 92 })),
  },
  { additionalProperties: false, minProperties: 1 },
);
export type BrandDataSourceBodySchemaType = Static<
  typeof BrandDataSourceBodySchema
>;

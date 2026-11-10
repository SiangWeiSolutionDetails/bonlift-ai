import Type, { type Static } from "typebox";
import { NameSchema } from "./name.schema.js";

export const BrandApiKeyStatusSchema = Type.Union([
  Type.Literal("live"),
  Type.Literal("revoked"),
  Type.Literal("expired"),
]);
export type BrandApiKeyStatusSchemaType = Static<typeof BrandApiKeyStatusSchema>;

// Never carries the secret: only its prefix, which identifies the key in logs and in the admin.
export const BrandApiKeyRecordSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    brandId: Type.String({ format: "uuid" }),
    name: Type.String(),
    // Null for keys created before channels existed: they serve requests without channel checks.
    channelId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
    channelCode: Type.Union([Type.String(), Type.Null()]),
    keyPrefix: Type.String(),
    status: BrandApiKeyStatusSchema,
    createdBy: Type.String(),
    createdAt: Type.String({ format: "date-time" }),
    expiresAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
    revokedAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
  },
  { additionalProperties: false },
);
export type BrandApiKeyRecordSchemaType = Static<typeof BrandApiKeyRecordSchema>;

export const BrandApiKeyListSchema = Type.Object(
  { apiKeys: Type.Array(BrandApiKeyRecordSchema) },
  { additionalProperties: false },
);
export type BrandApiKeyListSchemaType = Static<typeof BrandApiKeyListSchema>;

export const CreateBrandApiKeyBodySchema = Type.Object(
  {
    name: NameSchema,
    // Must be one of the brand's channels; the key serves that channel only.
    channelId: Type.String({ format: "uuid" }),
    expiresInDays: Type.Optional(Type.Integer({ minimum: 1, maximum: 3650 })),
  },
  { additionalProperties: false },
);
export type CreateBrandApiKeyBodySchemaType = Static<
  typeof CreateBrandApiKeyBodySchema
>;

// The only response that carries the secret, once, at creation.
export const CreatedBrandApiKeySchema = Type.Object(
  {
    ...BrandApiKeyRecordSchema.properties,
    key: Type.String(),
  },
  { additionalProperties: false },
);
export type CreatedBrandApiKeySchemaType = Static<typeof CreatedBrandApiKeySchema>;

export const BrandApiKeyParamsSchema = Type.Object({
  brandId: Type.String({ format: "uuid" }),
  keyId: Type.String({ format: "uuid" }),
});
export type BrandApiKeyParamsSchemaType = Static<typeof BrandApiKeyParamsSchema>;

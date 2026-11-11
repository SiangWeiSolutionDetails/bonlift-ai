import Type, { Static } from "typebox";

export const ServingConfigVersionRecordSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    brandId: Type.String({ format: "uuid" }),
    version: Type.Integer({ minimum: 1 }),
    createdBy: Type.Union([Type.String(), Type.Null()]),
    createdAt: Type.String({ format: "date-time" }),
    minFavouriteOrders: Type.Integer({ minimum: 1 }),
    minPairSample: Type.Integer({ minimum: 1 }),
    strongPairingLift: Type.Number({ minimum: 1, maximum: 9999.99 }),
    bestSellerMaxRank: Type.Integer({ minimum: 1 }),
    bestSellerMinListSize: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false },
);
export type ServingConfigVersionRecordSchemaType = Static<
  typeof ServingConfigVersionRecordSchema
>;

export const ServingConfigVersionsSchema = Type.Array(
  ServingConfigVersionRecordSchema,
);
export type ServingConfigVersionsSchemaType = Static<
  typeof ServingConfigVersionsSchema
>;

// Versions are immutable: this body creates the next version from the latest one.
export const CreateServingConfigVersionBodySchema = Type.Object(
  {
    minFavouriteOrders: Type.Optional(Type.Integer({ minimum: 1 })),
    minPairSample: Type.Optional(Type.Integer({ minimum: 1 })),
    strongPairingLift: Type.Optional(Type.Number({ minimum: 1, maximum: 9999.99 })),
    bestSellerMaxRank: Type.Optional(Type.Integer({ minimum: 1 })),
    bestSellerMinListSize: Type.Optional(Type.Integer({ minimum: 1 })),
  },
  { additionalProperties: false, minProperties: 1 },
);
export type CreateServingConfigVersionBodySchemaType = Static<
  typeof CreateServingConfigVersionBodySchema
>;

import Type, { type Static } from "typebox";

// The value an ordering app sends as `channel`, e.g. "tqr". Channels are a shared list (TQR, SOK, POS) that only
// changes through migrations, so codes are never renamed and usage history keeps pointing at the same channel.
export const ChannelCodeSchema = Type.String({ pattern: "^[a-z][a-z0-9_-]{0,31}$" });

// A shared channel as switched on or off for one brand. Every brand has a row for every channel, off by default.
export const BrandChannelRecordSchema = Type.Object(
  {
    brandId: Type.String({ format: "uuid" }),
    channelId: Type.String({ format: "uuid" }),
    code: ChannelCodeSchema,
    name: Type.String(),
    isActive: Type.Boolean(),
    updatedAt: Type.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);
export type BrandChannelRecordSchemaType = Static<typeof BrandChannelRecordSchema>;

export const BrandChannelListSchema = Type.Object(
  { channels: Type.Array(BrandChannelRecordSchema) },
  { additionalProperties: false },
);
export type BrandChannelListSchemaType = Static<typeof BrandChannelListSchema>;

// Switching a channel off makes its keys' requests fail with 400.
export const UpdateBrandChannelBodySchema = Type.Object(
  { isActive: Type.Boolean() },
  { additionalProperties: false },
);
export type UpdateBrandChannelBodySchemaType = Static<typeof UpdateBrandChannelBodySchema>;

export const BrandChannelParamsSchema = Type.Object({
  brandId: Type.String({ format: "uuid" }),
  channelId: Type.String({ format: "uuid" }),
});
export type BrandChannelParamsSchemaType = Static<typeof BrandChannelParamsSchema>;

import Type, { type Static } from "typebox";
import { CalculationJobTypeSchema } from "./calculation.schema.js";
import { CalculationRunStatusSchema } from "./outletItemScoresResult.schema.js";

const Count = Type.Integer({ minimum: 0 });

// from and to are inclusive business dates, read in tz (an IANA name such as "Asia/Singapore").
export const BrandUsageQuerySchema = Type.Object(
  {
    from: Type.String({ format: "date" }),
    to: Type.String({ format: "date" }),
    tz: Type.String({ minLength: 1, maxLength: 64 }),
  },
  { additionalProperties: false },
);
export type BrandUsageQuerySchemaType = Static<typeof BrandUsageQuerySchema>;

// Serving calls by outcome: 2xx and 3xx succeeded, 4xx is the caller's error, 5xx is ours.
export const ServingCallCountsSchema = Type.Object(
  {
    succeeded: Count,
    clientErrors: Count,
    serverErrors: Count,
  },
  { additionalProperties: false },
);
export type ServingCallCountsSchemaType = Static<typeof ServingCallCountsSchema>;

export const BrandUsageDaySchema = Type.Object(
  {
    date: Type.String({ format: "date" }),
    ...ServingCallCountsSchema.properties,
    calculationRuns: Count,
  },
  { additionalProperties: false },
);
export type BrandUsageDaySchemaType = Static<typeof BrandUsageDaySchema>;

// apiKeyId null: calls of a key that has since been deleted.
export const BrandUsageApiKeySchema = Type.Object(
  {
    apiKeyId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
    name: Type.Union([Type.String(), Type.Null()]),
    keyPrefix: Type.Union([Type.String(), Type.Null()]),
    ...ServingCallCountsSchema.properties,
  },
  { additionalProperties: false },
);
export type BrandUsageApiKeySchemaType = Static<typeof BrandUsageApiKeySchema>;

// channelId null: calls of keys without a channel (created before channels existed).
export const BrandUsageChannelSchema = Type.Object(
  {
    channelId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
    code: Type.Union([Type.String(), Type.Null()]),
    name: Type.Union([Type.String(), Type.Null()]),
    ...ServingCallCountsSchema.properties,
  },
  { additionalProperties: false },
);
export type BrandUsageChannelSchemaType = Static<typeof BrandUsageChannelSchema>;

export const BrandUsageCalculationSchema = Type.Object(
  {
    jobType: CalculationJobTypeSchema,
    status: CalculationRunStatusSchema,
    runs: Count,
  },
  { additionalProperties: false },
);
export type BrandUsageCalculationSchemaType = Static<
  typeof BrandUsageCalculationSchema
>;

export const BrandUsageSchema = Type.Object(
  {
    brandId: Type.String({ format: "uuid" }),
    from: Type.String({ format: "date" }),
    to: Type.String({ format: "date" }),
    tz: Type.String(),
    days: Type.Array(BrandUsageDaySchema),
    apiKeys: Type.Array(BrandUsageApiKeySchema),
    channels: Type.Array(BrandUsageChannelSchema),
    calculations: Type.Array(BrandUsageCalculationSchema),
  },
  { additionalProperties: false },
);
export type BrandUsageSchemaType = Static<typeof BrandUsageSchema>;

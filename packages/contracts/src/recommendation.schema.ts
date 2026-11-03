import Type, { Static } from "typebox";

// Serving contract (/v1) for TQR, POS and kiosk. Unlike the admin contracts, unknown fields are accepted and ignored,
// so a caller sending a newer field never gets a 400; callers must likewise ignore response fields and reason codes
// they do not know. Breaking changes go to /v2.

export const RecommendationCartItemSchema = Type.Object({
  itemId: Type.String({ minLength: 1 }),
  qty: Type.Number(),
});
export type RecommendationCartItemSchemaType = Static<
  typeof RecommendationCartItemSchema
>;

export const RecommendationRequestSchema = Type.Object({
  outletId: Type.String({ format: "uuid" }),
  // Local time with an explicit offset (D-T10). "Z" is rejected: the engine reads the local hour as written.
  at: Type.String({
    format: "date-time",
    pattern: "[+-][0-9]{2}:[0-9]{2}$",
  }),
  // Removed from the results and used to find items that go with it.
  cart: Type.Array(RecommendationCartItemSchema, { maxItems: 200 }),
  // Only removed from the results, e.g. items ordered in an earlier round or rejected.
  exclude: Type.Optional(
    Type.Array(Type.String({ minLength: 1 }), { maxItems: 200 }),
  ),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50 })),
  // Missing, null or blank is anonymous: no favourites.
  customerId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  // Accepted now, used when channel rules are served.
  channel: Type.Optional(Type.String()),
  pax: Type.Optional(Type.Integer({ minimum: 1 })),
});
export type RecommendationRequestSchemaType = Static<
  typeof RecommendationRequestSchema
>;

export const RecommendationReasonSchema = Type.Union([
  Type.Literal("popular_at_outlet"),
  Type.Literal("frequently_ordered"),
]);
export type RecommendationReasonSchemaType = Static<
  typeof RecommendationReasonSchema
>;

export const RecommendationItemSchema = Type.Object(
  {
    itemId: Type.String(),
    // Position in this response, after cart items are removed.
    rank: Type.Integer({ minimum: 1 }),
    reason: RecommendationReasonSchema,
  },
  { additionalProperties: false },
);
export type RecommendationItemSchemaType = Static<
  typeof RecommendationItemSchema
>;

export const RecommendationResponseSchema = Type.Object(
  {
    // The outlet popularity run.
    runId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
    // The customer item scores run, when the customer was looked up.
    customerRunId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
    daypart: Type.Union([Type.String(), Type.Null()]),
    items: Type.Array(RecommendationItemSchema),
  },
  { additionalProperties: false },
);
export type RecommendationResponseSchemaType = Static<
  typeof RecommendationResponseSchema
>;

import Type, { Static } from "typebox";

// Serving contract (/v1) for TQR, POS and kiosk. Unlike the admin contracts, unknown fields are accepted and ignored,
// so a caller sending a newer field never gets a 400; callers must likewise ignore response fields and reason codes
// they do not know. Breaking changes go to /v2.
// The descriptions are published to partners in the OpenAPI document: keep internal names and decision ids out of them.

export const RecommendationCartItemSchema = Type.Object(
  {
    itemId: Type.String({
      minLength: 1,
      description: "Your menu item id, as used in the order data you send us.",
      examples: ["ITEM-1001"],
    }),
    qty: Type.Number({ description: "Quantity in the cart.", examples: [2] }),
  },
  { description: "An item already in the cart." },
);
export type RecommendationCartItemSchemaType = Static<
  typeof RecommendationCartItemSchema
>;

// Shared by every /v1 request. The API key decides the channel; when sent, this must match it (checked by the
// serving channel hook).
export const ServingChannelSchema = Type.String({
  description:
    "The ordering channel, e.g. tqr, pos or sok. Optional: your API key already decides the channel. " +
    "When sent, it must be your key's channel code, or the request is rejected with 400.",
  examples: ["tqr"],
});

export const RecommendationRequestSchema = Type.Object(
  {
    outletId: Type.String({
      format: "uuid",
      description: "The outlet the order is placed at. Must belong to the brand of the API key.",
      examples: ["3f6c2a9e-8d1b-4c57-9a0e-2b7d4f1e6c35"],
    }),
    // Matched exactly against the stored daypart names; missing is all_day. An unknown name returns no items.
    daypart: Type.Optional(
      Type.String({
        minLength: 1,
        description:
          "The time-of-day period of the order, such as breakfast or lunch, using the names configured for the brand. " +
          "Both popular items and the customer's favourites are taken from this period; items that go with the cart " +
          "do not depend on it. Missing means the whole day. A name the brand has not configured returns no items.",
        examples: ["lunch"],
      }),
    ),
    // Removed from the results and used to find items that go with it.
    cart: Type.Array(RecommendationCartItemSchema, {
      maxItems: 200,
      description:
        "Items already in the cart. They are never recommended, and are used to find items that go with them. " +
        "Send an empty array for an empty cart.",
    }),
    // Only removed from the results, e.g. items ordered in an earlier round or rejected.
    exclude: Type.Optional(
      Type.Array(Type.String({ minLength: 1 }), {
        maxItems: 200,
        description:
          "Item ids that must not be recommended, such as items ordered in an earlier round or dismissed by the customer. " +
          "Unlike cart items, they do not affect which items go with the cart.",
        examples: [["ITEM-2002"]],
      }),
    ),
    // Missing or empty is no restriction. Cart and exclude still remove a listed item.
    include: Type.Optional(
      Type.Array(Type.String({ minLength: 1 }), {
        maxItems: 500,
        description:
          "Item ids that may be recommended, such as the items available right now. Only these items are returned. " +
          "Cart and excluded items are still never recommended. Missing or an empty array means any item may be returned.",
        examples: [["ITEM-3003", "ITEM-4004"]],
      }),
    ),
    limit: Type.Optional(
      Type.Integer({
        minimum: 1,
        maximum: 50,
        description: "Maximum number of items to return. Defaults to every recommended item.",
      }),
    ),
    // Missing, null or blank is anonymous: no favourites.
    customerId: Type.Optional(
      Type.Union([Type.String(), Type.Null()], {
        description:
          "Your customer id, as used in the order data you send us. Missing, null or blank means an anonymous " +
          "customer, who gets no personal favourites.",
        examples: ["CUST-000123"],
      }),
    ),
    channel: Type.Optional(ServingChannelSchema),
    pax: Type.Optional(
      Type.Integer({
        minimum: 1,
        description: "Number of diners. Accepted but not yet used.",
        examples: [2],
      }),
    ),
  },
  {
    description:
      "Unknown fields are accepted and ignored, so you can send fields added in later versions of this API.",
  },
);
export type RecommendationRequestSchemaType = Static<
  typeof RecommendationRequestSchema
>;

export const RecommendationReasonSchema = Type.Union(
  [
    Type.Literal("popular_at_outlet"),
    Type.Literal("frequently_ordered"),
    Type.Literal("goes_with_cart"),
  ],
  {
    description:
      "Why the item is recommended: `frequently_ordered` is one of this customer's favourites in the requested " +
      "`daypart`, `goes_with_cart` is often ordered together with the items in the cart, `popular_at_outlet` is " +
      "popular at this outlet in the requested `daypart`. New reasons may be added: treat an unknown reason as a " +
      "generic recommendation.",
  },
);
export type RecommendationReasonSchemaType = Static<
  typeof RecommendationReasonSchema
>;

export const RecommendationItemSchema = Type.Object(
  {
    itemId: Type.String({ description: "Your menu item id.", examples: ["ITEM-3003"] }),
    // Position in this response, after cart items are removed.
    rank: Type.Integer({
      minimum: 1,
      description: "Position in this response, starting at 1. Show items in this order.",
      examples: [1],
    }),
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
    runId: Type.Union([Type.String({ format: "uuid" }), Type.Null()], {
      description: "Opaque id of the outlet results served. Quote it when reporting an issue. Null when none exist.",
    }),
    // The customer item scores run, when the customer was looked up.
    customerRunId: Type.Union([Type.String({ format: "uuid" }), Type.Null()], {
      description:
        "Opaque id of the customer results served. Quote it when reporting an issue. Null for an anonymous customer " +
        "or when none exist.",
    }),
    // The item affinity run behind goes_with_cart items.
    affinityRunId: Type.Union([Type.String({ format: "uuid" }), Type.Null()], {
      description:
        "Opaque id of the results used for items that go with the cart. Quote it when reporting an issue. " +
        "Null when none exist.",
    }),
    daypart: Type.Union([Type.String(), Type.Null()], {
      description:
        "The time-of-day period served: the requested `daypart`, or `all_day` when none was sent. " +
        "Null when nothing is served, e.g. for an unknown outlet.",
      examples: ["lunch"],
    }),
    items: Type.Array(RecommendationItemSchema, {
      description:
        "Recommended items, best first. May be empty, e.g. for an unknown outlet or when no results are available yet: " +
        "continue the order without recommendations.",
    }),
  },
  {
    additionalProperties: false,
    description: "New fields may be added: ignore fields you do not know.",
  },
);
export type RecommendationResponseSchemaType = Static<
  typeof RecommendationResponseSchema
>;

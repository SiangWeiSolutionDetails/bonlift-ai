import Type, { Static } from "typebox";
import { RecommendationCartItemSchema } from "./recommendation.schema.js";

// Serving contract (/v1), same compatibility rules as recommendation.schema.ts: unknown request fields are accepted and
// ignored, callers ignore unknown response fields and reasons, breaking changes go to /v2. Descriptions are published.

export const ItemAffinityRequestSchema = Type.Object(
  {
    cart: Type.Array(RecommendationCartItemSchema, {
      maxItems: 200,
      description:
        "Items already in the cart. Items often ordered together with them are returned, and cart items themselves are " +
        "never returned. An empty array returns no items.",
    }),
    exclude: Type.Optional(
      Type.Array(Type.String({ minLength: 1 }), {
        maxItems: 200,
        description:
          "Item ids that must not be returned, such as items ordered in an earlier round or dismissed by the customer. " +
          "Unlike cart items, they are not used to find items that go with the cart.",
        examples: [["ITEM-2002"]],
      }),
    ),
    // Missing or empty is no restriction. Cart and exclude still remove a listed item.
    include: Type.Optional(
      Type.Array(Type.String({ minLength: 1 }), {
        maxItems: 500,
        description:
          "Item ids that may be returned, such as the items available right now. Only these items are returned. " +
          "Cart and excluded items are still never returned. Missing or an empty array means any item may be returned.",
        examples: [["ITEM-3003", "ITEM-4004"]],
      }),
    ),
    limit: Type.Optional(
      Type.Integer({
        minimum: 1,
        maximum: 50,
        description: "Maximum number of items to return. Defaults to every matching item.",
      }),
    ),
  },
  {
    description:
      "Unknown fields are accepted and ignored, so you can send fields added in later versions of this API.",
  },
);
export type ItemAffinityRequestSchemaType = Static<typeof ItemAffinityRequestSchema>;

export const ItemAffinityReasonSchema = Type.Union([Type.Literal("goes_with_cart")], {
  description:
    "Why the item is returned: `goes_with_cart` is often ordered together with an item in the cart. New reasons may " +
    "be added: treat an unknown reason as a generic recommendation.",
});
export type ItemAffinityReasonSchemaType = Static<typeof ItemAffinityReasonSchema>;

export const ItemAffinityItemSchema = Type.Object(
  {
    itemId: Type.String({ description: "Your menu item id.", examples: ["ITEM-3003"] }),
    rank: Type.Integer({
      minimum: 1,
      description: "Position in this response, starting at 1. Show items in this order.",
      examples: [1],
    }),
    reason: ItemAffinityReasonSchema,
  },
  { additionalProperties: false },
);
export type ItemAffinityItemSchemaType = Static<typeof ItemAffinityItemSchema>;

export const ItemAffinityResponseSchema = Type.Object(
  {
    runId: Type.Union([Type.String({ format: "uuid" }), Type.Null()], {
      description: "Opaque id of the results served. Quote it when reporting an issue. Null when none exist.",
    }),
    items: Type.Array(ItemAffinityItemSchema, {
      description:
        "Items that go with the cart, best first. May be empty, e.g. for an empty cart or when no results are " +
        "available yet: continue the order without them.",
    }),
  },
  {
    additionalProperties: false,
    description: "New fields may be added: ignore fields you do not know.",
  },
);
export type ItemAffinityResponseSchemaType = Static<typeof ItemAffinityResponseSchema>;

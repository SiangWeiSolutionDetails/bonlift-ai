import Type, { Static } from "typebox";
import { ErrorResponseSchema } from "./error.schema.js";

// Serving contract (/v1), same compatibility rules as recommendation.schema.ts: unknown request fields are accepted and
// ignored, breaking changes go to /v2. Descriptions are published.

export const RecommendationFeedbackParamsSchema = Type.Object({
  recommendationId: Type.String({
    format: "uuid",
    description: "The `recommendationId` of the recommendations response the item was in.",
    examples: ["7b1f3c2a-5d4e-4f6a-8b9c-0d1e2f3a4b5c"],
  }),
});
export type RecommendationFeedbackParamsSchemaType = Static<
  typeof RecommendationFeedbackParamsSchema
>;

export const RecommendationFeedbackTypeSchema = Type.Union(
  [Type.Literal("accepted"), Type.Literal("rejected")],
  {
    description:
      "`accepted` when the customer adds the suggested item to the cart, `rejected` when they dismiss it.",
  },
);
export type RecommendationFeedbackTypeSchemaType = Static<
  typeof RecommendationFeedbackTypeSchema
>;

export const RecommendationFeedbackBodySchema = Type.Object(
  {
    itemId: Type.String({
      minLength: 1,
      description: "The recommended item the customer acted on, as returned in `items`.",
      examples: ["ITEM-3003"],
    }),
    type: RecommendationFeedbackTypeSchema,
    // Required: only identified customers give feedback. Blank is rejected by the service, after trimming.
    customerId: Type.String({
      description:
        "Required. The same `customerId` you sent with the recommendations request, in the same format: a mobile " +
        "number with its country dial code and no \"+\", or an email address. A missing, blank or malformed value " +
        "is rejected with 400 and nothing is recorded: only identified customers can give feedback. A rejected " +
        "item is not recommended to this customer again for a while, and accepting it later lifts that.",
      examples: ["6591234567"],
    }),
  },
  {
    description:
      "Unknown fields are accepted and ignored, so you can send fields added in later versions of this API.",
  },
);
export type RecommendationFeedbackBodySchemaType = Static<
  typeof RecommendationFeedbackBodySchema
>;

export const RecommendationFeedbackResponseSchema = Type.Null({
  description: "Feedback received. There is no response body.",
});

// Unlike /v1/recommendations, feedback does not hide a failure on our side: the caller retries it.
export const RecommendationFeedbackErrorResponseSchema = {
  ...ErrorResponseSchema,
  description:
    "The feedback could not be recorded on our side. Retry it later; the same feedback is only counted once.",
};

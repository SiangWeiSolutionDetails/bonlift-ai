import {
  RecommendationFeedbackBodySchema,
  RecommendationFeedbackBodySchemaType,
  RecommendationFeedbackErrorResponseSchema,
  RecommendationFeedbackParamsSchema,
  RecommendationFeedbackParamsSchemaType,
  RecommendationFeedbackResponseSchema,
  RecommendationRequestSchema,
  RecommendationRequestSchemaType,
  RecommendationResponseSchema,
  ServingErrorResponseSchemas,
} from "@bonlift-ai/contracts";
import { getPool } from "@bonlift-ai/db";
import { FastifyInstance } from "fastify";
import { readCustomerIdSecret } from "../config/env.js";
import { createRecommendationServeHook } from "../plugins/recommendationServes.js";
import { getRecommendations } from "../services/recommendation.service.js";
import { recordRecommendationFeedback } from "../services/recommendationFeedback.service.js";

const FEEDBACK_DESCRIPTION =
  "Tells us what the customer did with an item from a recommendations response. Send `accepted` when the customer " +
  "adds a suggested item to the cart and `rejected` when they dismiss it: one call per action, within 2 hours of the " +
  "recommendation, using the response's `recommendationId`. Feedback sent later, or for an item that was not in " +
  "that response, is ignored.\n\n" +
  "Items you send no feedback for count as ignored by the customer. So request a `limit` equal to the number of " +
  "items you display, and pass the items available right now in `include`, so that every returned item is one the " +
  "customer could see.\n\n" +
  "Send the same `customerId` as on the recommendations request. A rejected item is then not recommended to that " +
  "customer again for a while, and accepting it later lifts that. Without it the feedback still counts, but nothing " +
  "is remembered for the customer.\n\n" +
  "A valid request always gets 202 with no body, whether or not the feedback matched a recommendation. Retries are " +
  "safe: the same feedback is only counted once. Call this from your server, never from the customer's device, so " +
  "your API key is never exposed.";

export async function recommendationRoutes(app: FastifyInstance) {
  app.decorateRequest("recommendationServe", null);

  app.post<{ Body: RecommendationRequestSchemaType }>(
    "/recommendations",
    {
      schema: {
        summary: "Recommendations for an order",
        description:
          "Returns a ranked list of items to suggest for an order at an outlet. For an identified customer it is " +
          "that customer's favourites; for an anonymous customer, or one with no favourites to show, it is the items " +
          "popular at the outlet. Both are for the requested `daypart`, or the whole day when none is sent. Favourites " +
          "that go with an item in the cart come first, and the rest follow in the customer's usual order. Items in " +
          "the cart or in `exclude` are never returned, and neither are items an identified customer rejected " +
          "recently (see the feedback endpoint). Apply your own availability and dietary filters before " +
          "display, and show the top items. Any failure on our side returns an empty list, so the order can always " +
          "continue.\n\n" +
          "Every item has one `reason`, which says why it was picked. Its optional `detail` adds facts for stronger " +
          "wording, and each fact is omitted when it does not apply. Show the strongest wording available, e.g. " +
          "\"Best seller here\" when `bestSeller` is sent and \"Popular here\" when it is not.\n\n" +
          "**Reasons**\n\n" +
          "| Reason | When it is used | Detail it can come with |\n" +
          "|---|---|---|\n" +
          "| `frequently_ordered` | One of this customer's favourites in the served `daypart`. Only for an identified " +
          "customer. | `basedOn` |\n" +
          "| `popular_at_outlet` | Popular at this outlet in the served `daypart`. Used when there are no favourites " +
          "to show. | `bestSeller` |\n\n" +
          "**Detail**\n\n" +
          "| Field | Meaning | Example wording |\n" +
          "|---|---|---|\n" +
          "| `basedOn` | A favourite that goes with an item in the cart: the cart item ids, strongest first. Use the " +
          "first one. | \"Your usual, goes with your Kopi\" |\n" +
          "| `bestSeller` | One of the top sellers at this outlet in the served `daypart`, sent only when the outlet " +
          "has enough ranked items. | \"Best seller here\" |\n\n" +
          "New reasons and detail fields may be added: treat an unknown reason as a generic recommendation and ignore " +
          "fields you do not know.",
        tags: ["Recommendations"],
        body: RecommendationRequestSchema,
        response: { 200: RecommendationResponseSchema, ...ServingErrorResponseSchemas },
      },
      onResponse: createRecommendationServeHook(getPool),
    },
    async (request) => {
      const pool = getPool();
      // Set by the /v1 API key hook, which rejects the request before this handler without a brand.
      const { response, serve } = await getRecommendations(
        pool,
        request.log,
        request.servingBrandId as string,
        request.body,
        readCustomerIdSecret(),
      );
      request.recommendationServe = serve;
      return response;
    },
  );

  app.post<{ Params: RecommendationFeedbackParamsSchemaType; Body: RecommendationFeedbackBodySchemaType }>(
    "/recommendations/:recommendationId/feedback",
    {
      schema: {
        summary: "Feedback on a recommended item",
        description: FEEDBACK_DESCRIPTION,
        tags: ["Recommendations"],
        params: RecommendationFeedbackParamsSchema,
        body: RecommendationFeedbackBodySchema,
        response: {
          202: RecommendationFeedbackResponseSchema,
          ...ServingErrorResponseSchemas,
          500: RecommendationFeedbackErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const pool = getPool();
      // A database error is not swallowed here, unlike recommendations: the caller retries, and the write is idempotent.
      await recordRecommendationFeedback(
        pool,
        request.servingBrandId as string,
        request.params.recommendationId,
        request.body,
        readCustomerIdSecret(),
      );
      return reply.status(202).send();
    },
  );
}

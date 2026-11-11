import {
  RecommendationRequestSchema,
  RecommendationRequestSchemaType,
  RecommendationResponseSchema,
  ServingErrorResponseSchemas,
} from "@bonlift-ai/contracts";
import { getPool } from "@bonlift-ai/db";
import { FastifyInstance } from "fastify";
import { readCustomerIdSecret } from "../config/env.js";
import { getRecommendations } from "../services/recommendation.service.js";

export async function recommendationRoutes(app: FastifyInstance) {
  app.post<{ Body: RecommendationRequestSchemaType }>(
    "/recommendations",
    {
      schema: {
        summary: "Recommendations for an order",
        description:
          "Returns a ranked list of items to suggest for an order at an outlet. For an identified customer it is " +
          "that customer's favourites; for an anonymous customer, or one with no favourites to show, it is the items " +
          "popular at the outlet. Both are for the requested `daypart`, or the whole day when none is sent. Items in " +
          "the cart or in `exclude` are never returned. Apply your own availability and dietary filters before " +
          "display, and show the top items. Any failure on our side returns an empty list, so the order can always " +
          "continue.\n\n" +
          "Every item has one `reason`, which says why it was picked. Its optional `detail` adds facts for stronger " +
          "wording, and each fact is omitted when it does not apply. Show the strongest wording available, e.g. " +
          "\"Best seller here\" when `bestSeller` is sent and \"Popular here\" when it is not.\n\n" +
          "**Reasons**\n\n" +
          "| Reason | When it is used | Detail it can come with |\n" +
          "|---|---|---|\n" +
          "| `frequently_ordered` | One of this customer's favourites in the served `daypart`. Only for an identified " +
          "customer. | none |\n" +
          "| `popular_at_outlet` | Popular at this outlet in the served `daypart`. Used when there are no favourites " +
          "to show. | `bestSeller` |\n\n" +
          "**Detail**\n\n" +
          "| Field | Meaning | Example wording |\n" +
          "|---|---|---|\n" +
          "| `bestSeller` | One of the top sellers at this outlet in the served `daypart`, sent only when the outlet " +
          "has enough ranked items. | \"Best seller here\" |\n\n" +
          "New reasons and detail fields may be added: treat an unknown reason as a generic recommendation and ignore " +
          "fields you do not know.",
        tags: ["Recommendations"],
        body: RecommendationRequestSchema,
        response: { 200: RecommendationResponseSchema, ...ServingErrorResponseSchemas },
      },
    },
    (request) => {
      const pool = getPool();
      // Set by the /v1 API key hook, which rejects the request before this handler without a brand.
      return getRecommendations(
        pool,
        request.log,
        request.servingBrandId as string,
        request.body,
        readCustomerIdSecret(),
      );
    },
  );
}

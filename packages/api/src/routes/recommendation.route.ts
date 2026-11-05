import {
  RecommendationRequestSchema,
  RecommendationRequestSchemaType,
  RecommendationResponseSchema,
  ServingErrorResponseSchemas,
} from "@ai-services/contracts";
import { getPool } from "@ai-services/db";
import { FastifyInstance } from "fastify";
import { getRecommendations } from "../services/recommendation.service.js";

export async function recommendationRoutes(app: FastifyInstance) {
  app.post<{ Body: RecommendationRequestSchemaType }>(
    "/recommendations",
    {
      schema: {
        summary: "Recommendations for an order",
        description:
          "Returns a ranked list of items to suggest for an order at an outlet: the customer's favourites that go with " +
          "the cart first, then items popular at the outlet at this time of day. Items in the cart or in `exclude` are " +
          "never returned. Apply your own availability and dietary filters before display, and show the top items. " +
          "Any failure on our side returns an empty list, so the order can always continue.",
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
      );
    },
  );
}

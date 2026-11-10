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
          "Returns a ranked list of items to suggest for an order at an outlet: the customer's favourites that go with " +
          "the cart first, then items often ordered with the cart, then items popular at the outlet. Favourites and " +
          "popular items are for the requested `daypart`, or the whole day when none is sent. Items in the cart or in `exclude` are " +
          "never returned. Popular add-ons for the daypart come separately in `addons`. Apply your own availability " +
          "and dietary filters before display, and show the top items. " +
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
        readCustomerIdSecret(),
      );
    },
  );
}

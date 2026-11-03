import {
  RecommendationRequestSchema,
  RecommendationRequestSchemaType,
  RecommendationResponseSchema,
} from "@ai-services/contracts";
import { getPool } from "@ai-services/db";
import { FastifyInstance } from "fastify";
import { getRecommendations } from "../services/recommendation.service.js";

export async function recommendationRoutes(app: FastifyInstance) {
  app.post<{ Body: RecommendationRequestSchemaType }>(
    "/recommendations",
    {
      schema: {
        body: RecommendationRequestSchema,
        response: { 200: RecommendationResponseSchema },
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

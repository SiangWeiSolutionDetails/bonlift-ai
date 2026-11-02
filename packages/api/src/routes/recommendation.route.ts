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
      return getRecommendations(pool, request.log, request.body);
    },
  );
}

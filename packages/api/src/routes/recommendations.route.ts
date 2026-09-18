import type { FastifyInstance } from "fastify";
import { getOutletRecommendations } from "../services/recommendations.service.js";
import { getPool } from "@ai-services/db";

const paramsSchema = {
  type: "object",
  required: ["outletId"],
  properties: {
    outletId: { type: "string" },
  },
} as const;

const responseSchema = {
  200: {
    type: "object",
    properties: {
      outletId: { type: "string" },
      recommendations: {
        type: "array",
        items: {
          type: "object",
          properties: {
            refId: { type: "string" },
            itemName: { type: "string" },
            category: { type: "string" },
            score: { type: "number" },
          },
          required: ["refId", "itemName", "category", "score"],
        },
      },
    },
    required: ["outletId", "recommendations"],
  },
} as const;

export async function recommendationsRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get<{ Params: { outletId: string } }>(
    "/outlets/:outletId/recommendations",
    { schema: { params: paramsSchema, response: responseSchema } },
    (request, _reply) => {
      const pool = getPool();
      return getOutletRecommendations(pool, request.params.outletId);
    },
  );
}

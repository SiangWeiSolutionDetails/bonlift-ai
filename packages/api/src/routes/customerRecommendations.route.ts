import { getPool } from "@ai-services/db";
import { FastifyInstance } from "fastify";
import { getCustomerRecommendations } from "../services/customerRecommendations.service.js";

const paramsSchema = {
  type: "object",
  required: ["customerId"],
  properties: {
    customerId: { type: "string" },
  },
} as const;

const querystringSchema = {
  type: "object",
  properties: {
    brandId: { type: "string" },
  },
} as const;

const responseSchema = {
  200: {
    type: "object",
    properties: {
      customerId: { type: "string" },
      brandId: { type: "string" },
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
  },
} as const;

export async function customerRecommendationsRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get<{ Params: { customerId: string }; Querystring: { brandId: string } }>(
    "/customers/:customerId/recommendations",
    {
      schema: {
        params: paramsSchema,
        querystring: querystringSchema,
        response: responseSchema,
      },
    },
    (request) => {
      const pool = getPool();
      return getCustomerRecommendations(
        pool,
        request.params.customerId,
        request.query.brandId,
      );
    },
  );
}

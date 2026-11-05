import {
  ItemAffinityRequestSchema,
  ItemAffinityRequestSchemaType,
  ItemAffinityResponseSchema,
} from "@ai-services/contracts";
import { getPool } from "@ai-services/db";
import { FastifyInstance } from "fastify";
import { getItemAffinityRecommendations } from "../services/itemAffinityServing.service.js";

export async function itemAffinityServingRoutes(app: FastifyInstance) {
  app.post<{ Body: ItemAffinityRequestSchemaType }>(
    "/item-affinity",
    {
      schema: {
        body: ItemAffinityRequestSchema,
        response: { 200: ItemAffinityResponseSchema },
      },
    },
    (request) => {
      const pool = getPool();
      // Set by the /v1 API key hook, which rejects the request before this handler without a brand.
      return getItemAffinityRecommendations(
        pool,
        request.log,
        request.servingBrandId as string,
        request.body,
      );
    },
  );
}

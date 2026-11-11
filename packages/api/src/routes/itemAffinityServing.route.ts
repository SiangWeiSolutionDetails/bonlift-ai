import {
  ItemAffinityRequestSchema,
  ItemAffinityRequestSchemaType,
  ItemAffinityResponseSchema,
  ServingErrorResponseSchemas,
} from "@bonlift-ai/contracts";
import { getPool } from "@bonlift-ai/db";
import { FastifyInstance } from "fastify";
import { getItemAffinityRecommendations } from "../services/itemAffinityServing.service.js";

export async function itemAffinityServingRoutes(app: FastifyInstance) {
  app.post<{ Body: ItemAffinityRequestSchemaType }>(
    "/item-affinity",
    {
      schema: {
        summary: "Items often ordered together",
        description:
          "Returns what most people order with the item the customer is looking at (`itemId`), or with the whole " +
          "cart when `itemId` is missing, best first. Use it for a \"what most people order with\" section. Items in " +
          "the cart or in `exclude` are never returned. Apply your own availability and dietary filters before " +
          "display. Any failure on our side returns an empty list, so the order can always continue.\n\n" +
          "**Reasons**\n\n" +
          "| Reason | When it is used |\n" +
          "|---|---|\n" +
          "| `often_ordered_with` | What most people order with `itemId`, or with an item in the cart when `itemId` " +
          "is missing. |\n\n" +
          "New reasons may be added: treat an unknown reason as a generic recommendation.",
        tags: ["Recommendations"],
        body: ItemAffinityRequestSchema,
        response: { 200: ItemAffinityResponseSchema, ...ServingErrorResponseSchemas },
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

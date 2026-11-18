import {
  ItemAffinityRequestSchema,
  ItemAffinityRequestSchemaType,
  ItemAffinityResponseSchema,
  ServingErrorResponseSchemas,
} from "@bonlift-ai/contracts";
import { getPool } from "@bonlift-ai/db";
import { FastifyInstance } from "fastify";
import { readCustomerIdSecret } from "../config/env.js";
import { createServedExposureHook } from "../plugins/servedExposures.js";
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
          "the cart or in `exclude` are never returned, and neither are items an identified customer rejected " +
          "recently. Apply your own availability and dietary filters before display. Any failure on our side " +
          "returns an empty list, so the order can always continue.\n\n" +
          "**Feedback**\n\n" +
          "Report what the customer did with each item to `POST /v1/feedback`, with the same `customerId` and the " +
          "item's `itemId`, exactly as for recommendations. An item the customer rejects is then not returned to them " +
          "for a while, here or by `POST /v1/recommendations`. Send `outletId` and the customer's `customerId` so the " +
          "returned items count as shown to that customer: like items shown by `POST /v1/recommendations`, they then " +
          "move down there for a while unless the customer accepts them. Without an `outletId` of your brand or a " +
          "`customerId`, the items are not counted as shown.\n\n" +
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
      onResponse: createServedExposureHook(getPool),
    },
    async (request) => {
      const pool = getPool();
      // Set by the /v1 API key hook, which rejects the request before this handler without a brand.
      const { response, exposure } = await getItemAffinityRecommendations(
        pool,
        request.log,
        request.servingBrandId as string,
        request.body,
        readCustomerIdSecret(),
      );
      request.servedExposure = exposure;
      return response;
    },
  );
}

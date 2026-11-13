import { BrandParamsSchema, BrandParamsSchemaType, CalculationsOverviewSchema } from "@bonlift-ai/contracts";
import { getPool } from "@bonlift-ai/db";
import { FastifyInstance } from "fastify";
import { getCalculationsOverview } from "../services/calculationsOverview.service.js";

export async function calculationsOverviewRoutes(app: FastifyInstance) {
  app.get<{ Params: BrandParamsSchemaType }>(
    "/brands/:brandId/calculations/overview",
    {
      schema: {
        params: BrandParamsSchema,
        response: { 200: CalculationsOverviewSchema },
      },
    },
    (request) => getCalculationsOverview(getPool(), request.params.brandId),
  );
}

import {
  BrandParamsSchema,
  BrandParamsSchemaType,
  BrandUsageQuerySchema,
  BrandUsageQuerySchemaType,
  BrandUsageSchema,
} from "@bonlift-ai/contracts";
import { getPool } from "@bonlift-ai/db";
import { FastifyInstance } from "fastify";
import { getBrandUsage } from "../services/brandUsage.service.js";

export async function brandUsageRoutes(app: FastifyInstance) {
  app.get<{ Params: BrandParamsSchemaType; Querystring: BrandUsageQuerySchemaType }>(
    "/brands/:brandId/usage",
    {
      config: { access: { brand: "usage.view", from: "params.brandId" } },
      schema: {
        params: BrandParamsSchema,
        querystring: BrandUsageQuerySchema,
        response: { 200: BrandUsageSchema },
      },
    },
    (request) => {
      const pool = getPool();
      return getBrandUsage(pool, request.params.brandId, request.query);
    },
  );
}

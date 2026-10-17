import {
  BrandDataSourceBodySchema,
  BrandDataSourceBodySchemaType,
  BrandDataSourceRecordSchema,
  BrandParamsSchema,
} from "@ai-services/contracts";
import { getPool } from "@ai-services/db";
import { FastifyInstance } from "fastify";
import {
  getBrandDataSource,
  updateBrandDataSource,
} from "../services/brandDataSource.service.js";

export async function brandDataSourceRoutes(app: FastifyInstance) {
  app.get<{ Params: { brandId: string } }>(
    "/brands/:brandId/data-source",
    {
      schema: {
        params: BrandParamsSchema,
        response: { 200: BrandDataSourceRecordSchema },
      },
    },
    (request) => {
      const pool = getPool();
      return getBrandDataSource(pool, request.params.brandId);
    },
  );

  app.patch<{
    Params: { brandId: string };
    Body: BrandDataSourceBodySchemaType;
  }>(
    "/brands/:brandId/data-source",
    {
      schema: {
        params: BrandParamsSchema,
        body: BrandDataSourceBodySchema,
        response: { 200: BrandDataSourceRecordSchema },
      },
    },
    (request) => {
      const pool = getPool();
      return updateBrandDataSource(pool, request.params.brandId, request.body);
    },
  );
}

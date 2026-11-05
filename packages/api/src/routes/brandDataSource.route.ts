import {
  BrandDataSourceRecordSchema,
  BrandParamsSchema,
  BrandParamsSchemaType,
  UpdateBrandDataSourceBodySchema,
  UpdateBrandDataSourceBodySchemaType,
} from "@bonlift-ai/contracts";
import { getPool } from "@bonlift-ai/db";
import { FastifyInstance } from "fastify";
import {
  getBrandDataSource,
  updateBrandDataSource,
} from "../services/brandDataSource.service.js";

export async function brandDataSourceRoutes(app: FastifyInstance) {
  app.get<{ Params: BrandParamsSchemaType }>(
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
    Params: BrandParamsSchemaType;
    Body: UpdateBrandDataSourceBodySchemaType;
  }>(
    "/brands/:brandId/data-source",
    {
      schema: {
        params: BrandParamsSchema,
        body: UpdateBrandDataSourceBodySchema,
        response: { 200: BrandDataSourceRecordSchema },
      },
    },
    (request) => {
      const pool = getPool();
      return updateBrandDataSource(pool, request.params.brandId, request.body);
    },
  );
}

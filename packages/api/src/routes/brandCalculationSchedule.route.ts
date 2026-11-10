import {
  BrandCalculationScheduleRecordSchema,
  BrandParamsSchema,
  BrandParamsSchemaType,
  UpdateBrandCalculationScheduleBodySchema,
  UpdateBrandCalculationScheduleBodySchemaType,
} from "@bonlift-ai/contracts";
import { getPool } from "@bonlift-ai/db";
import { syncBrandCalculationSchedule } from "@bonlift-ai/worker";
import { FastifyInstance } from "fastify";
import {
  getBrandCalculationSchedule,
  updateBrandCalculationSchedule,
} from "../services/brandCalculationSchedule.service.js";

export async function brandCalculationScheduleRoutes(app: FastifyInstance) {
  app.get<{ Params: BrandParamsSchemaType }>(
    "/brands/:brandId/calculation-schedule",
    {
      schema: {
        params: BrandParamsSchema,
        response: { 200: BrandCalculationScheduleRecordSchema },
      },
    },
    (request) => {
      const pool = getPool();
      return getBrandCalculationSchedule(pool, request.params.brandId);
    },
  );

  app.patch<{
    Params: BrandParamsSchemaType;
    Body: UpdateBrandCalculationScheduleBodySchemaType;
  }>(
    "/brands/:brandId/calculation-schedule",
    {
      schema: {
        params: BrandParamsSchema,
        body: UpdateBrandCalculationScheduleBodySchema,
        response: { 200: BrandCalculationScheduleRecordSchema },
      },
    },
    (request) => {
      const pool = getPool();
      return updateBrandCalculationSchedule(
        pool,
        syncBrandCalculationSchedule,
        request.params.brandId,
        request.body,
        "api",
      );
    },
  );
}

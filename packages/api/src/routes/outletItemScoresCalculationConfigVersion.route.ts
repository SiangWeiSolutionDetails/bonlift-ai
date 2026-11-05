import {
  BrandParamsSchema,
  BrandParamsSchemaType,
  CreateOutletItemScoresCalculationConfigVersionBodySchema,
  CreateOutletItemScoresCalculationConfigVersionBodySchemaType,
  OutletItemScoresCalculationConfigVersionRecordSchema,
  OutletItemScoresCalculationConfigVersionsSchema,
} from "@bonlift-ai/contracts";
import { getPool } from "@bonlift-ai/db";
import { FastifyInstance } from "fastify";
import {
  createOutletItemScoresCalculationConfigVersion,
  getLatestOutletItemScoresCalculationConfigVersion,
  getOutletItemScoresCalculationConfigVersions,
} from "../services/outletItemScoresCalculationConfigVersion.service.js";

const PATH = "/brands/:brandId/calculation-configs/outlet-item-scores";

export async function outletItemScoresCalculationConfigVersionRoutes(
  app: FastifyInstance,
) {
  app.get<{ Params: BrandParamsSchemaType }>(
    PATH,
    {
      schema: {
        params: BrandParamsSchema,
        response: { 200: OutletItemScoresCalculationConfigVersionRecordSchema },
      },
    },
    (request) => {
      const pool = getPool();
      return getLatestOutletItemScoresCalculationConfigVersion(
        pool,
        request.params.brandId,
      );
    },
  );

  app.get<{ Params: BrandParamsSchemaType }>(
    `${PATH}/versions`,
    {
      schema: {
        params: BrandParamsSchema,
        response: { 200: OutletItemScoresCalculationConfigVersionsSchema },
      },
    },
    (request) => {
      const pool = getPool();
      return getOutletItemScoresCalculationConfigVersions(
        pool,
        request.params.brandId,
      );
    },
  );

  app.patch<{
    Params: BrandParamsSchemaType;
    Body: CreateOutletItemScoresCalculationConfigVersionBodySchemaType;
  }>(
    PATH,
    {
      schema: {
        params: BrandParamsSchema,
        body: CreateOutletItemScoresCalculationConfigVersionBodySchema,
        response: { 201: OutletItemScoresCalculationConfigVersionRecordSchema },
      },
    },
    async (request, reply) => {
      const pool = getPool();
      const version = await createOutletItemScoresCalculationConfigVersion(
        pool,
        request.params.brandId,
        request.body,
        "api",
      );
      reply.status(201);
      return version;
    },
  );
}

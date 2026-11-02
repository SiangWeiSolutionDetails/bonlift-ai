import {
  BrandParamsSchema,
  BrandParamsSchemaType,
  CreateCustomerItemScoresCalculationConfigVersionBodySchema,
  CreateCustomerItemScoresCalculationConfigVersionBodySchemaType,
  CustomerItemScoresCalculationConfigVersionRecordSchema,
  CustomerItemScoresCalculationConfigVersionsSchema,
} from "@ai-services/contracts";
import { getPool } from "@ai-services/db";
import { FastifyInstance } from "fastify";
import {
  createCustomerItemScoresCalculationConfigVersion,
  getCustomerItemScoresCalculationConfigVersions,
  getLatestCustomerItemScoresCalculationConfigVersion,
} from "../services/customerItemScoresCalculationConfigVersion.service.js";

const PATH = "/brands/:brandId/calculation-configs/customer-item-scores";

export async function customerItemScoresCalculationConfigVersionRoutes(
  app: FastifyInstance,
) {
  app.get<{ Params: BrandParamsSchemaType }>(
    PATH,
    {
      schema: {
        params: BrandParamsSchema,
        response: { 200: CustomerItemScoresCalculationConfigVersionRecordSchema },
      },
    },
    (request) => {
      const pool = getPool();
      return getLatestCustomerItemScoresCalculationConfigVersion(
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
        response: { 200: CustomerItemScoresCalculationConfigVersionsSchema },
      },
    },
    (request) => {
      const pool = getPool();
      return getCustomerItemScoresCalculationConfigVersions(
        pool,
        request.params.brandId,
      );
    },
  );

  app.patch<{
    Params: BrandParamsSchemaType;
    Body: CreateCustomerItemScoresCalculationConfigVersionBodySchemaType;
  }>(
    PATH,
    {
      schema: {
        params: BrandParamsSchema,
        body: CreateCustomerItemScoresCalculationConfigVersionBodySchema,
        response: { 201: CustomerItemScoresCalculationConfigVersionRecordSchema },
      },
    },
    async (request, reply) => {
      const pool = getPool();
      const version = await createCustomerItemScoresCalculationConfigVersion(
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

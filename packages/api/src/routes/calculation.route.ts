import { FastifyInstance } from "fastify";
import {
  queueCustomerItemScores,
  queueItemAffinity,
  queueOutletItemScores,
} from "@ai-services/worker";
import { getPool } from "@ai-services/db";
import {
  BrandParamsSchema,
  BrandParamsSchemaType,
  CustomerItemScoresCalculationQuerySchema,
  CustomerItemScoresCalculationQuerySchemaType,
  CustomerItemScoresCalculationResponseSchema,
  ItemAffinityCalculationQuerySchema,
  ItemAffinityCalculationQuerySchemaType,
  ItemAffinityCalculationResponseSchema,
  OutletItemScoresCalculationQuerySchema,
  OutletItemScoresCalculationQuerySchemaType,
  OutletItemScoresCalculationResponseSchema,
  OutletParamsSchema,
  OutletParamsSchemaType,
} from "@ai-services/contracts";
import { startOutletItemScoresCalculation } from "../services/calculation.service.js";
import { startCustomerItemScoresCalculation } from "../services/customerItemScoresCalculation.service.js";
import { startItemAffinityCalculation } from "../services/itemAffinityCalculation.service.js";

export async function calculationRoutes(app: FastifyInstance) {
  app.post<{
    Params: OutletParamsSchemaType;
    Querystring: OutletItemScoresCalculationQuerySchemaType;
  }>(
    "/calculate/outlet-item-scores/:outletId",
    {
      schema: {
        params: OutletParamsSchema,
        querystring: OutletItemScoresCalculationQuerySchema,
        response: { 202: OutletItemScoresCalculationResponseSchema },
      },
    },
    async (request, reply) => {
      const pool = getPool();
      const result = await startOutletItemScoresCalculation(
        pool,
        queueOutletItemScores,
        request.params.outletId,
        request.query,
        { type: "manual", by: "api" },
      );
      reply.status(202);
      return result;
    },
  );

  app.post<{
    Params: BrandParamsSchemaType;
    Querystring: CustomerItemScoresCalculationQuerySchemaType;
  }>(
    "/calculate/customer-item-scores/:brandId",
    {
      schema: {
        params: BrandParamsSchema,
        querystring: CustomerItemScoresCalculationQuerySchema,
        response: { 202: CustomerItemScoresCalculationResponseSchema },
      },
    },
    async (request, reply) => {
      const pool = getPool();
      const result = await startCustomerItemScoresCalculation(
        pool,
        queueCustomerItemScores,
        request.params.brandId,
        request.query,
        { type: "manual", by: "api" },
      );
      reply.status(202);
      return result;
    },
  );

  app.post<{
    Params: BrandParamsSchemaType;
    Querystring: ItemAffinityCalculationQuerySchemaType;
  }>(
    "/calculate/item-affinity/:brandId",
    {
      schema: {
        params: BrandParamsSchema,
        querystring: ItemAffinityCalculationQuerySchema,
        response: { 202: ItemAffinityCalculationResponseSchema },
      },
    },
    async (request, reply) => {
      const pool = getPool();
      const result = await startItemAffinityCalculation(
        pool,
        queueItemAffinity,
        request.params.brandId,
        request.query,
        { type: "manual", by: "api" },
      );
      reply.status(202);
      return result;
    },
  );
}

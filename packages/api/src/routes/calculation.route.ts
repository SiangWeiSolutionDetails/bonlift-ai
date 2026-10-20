import { FastifyInstance } from "fastify";
import { queueCalculation } from "@ai-services/worker";
import { getPool } from "@ai-services/db";
import {
  OutletItemScoresCalculationQuerySchema,
  OutletItemScoresCalculationQuerySchemaType,
  OutletItemScoresCalculationResponseSchema,
  OutletParamsSchema,
  OutletParamsSchemaType,
} from "@ai-services/contracts";
import { startOutletItemScoresCalculation } from "../services/calculation.service.js";

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
        queueCalculation,
        request.params.outletId,
        request.query,
        { type: "manual", by: "api" },
      );
      reply.status(202);
      return result;
    },
  );
}

import {
  OutletItemScoresRunListQuerySchema,
  OutletItemScoresRunListQuerySchemaType,
  OutletItemScoresRunListSchema,
  OutletItemScoresRunRecordSchema,
  OutletItemScoresRunResultSchema,
  OutletParamsSchema,
  OutletParamsSchemaType,
  PublishOutletItemScoresRunBodySchema,
  PublishOutletItemScoresRunBodySchemaType,
  RunParamsSchema,
  RunParamsSchemaType,
} from "@ai-services/contracts";
import { getPool } from "@ai-services/db";
import { FastifyInstance } from "fastify";
import {
  getOutletItemScoresRunResult,
  getOutletItemScoresRuns,
  publishOutletItemScoresRun,
} from "../services/outletItemScoresResult.service.js";

export async function outletItemScoresResultRoutes(app: FastifyInstance) {
  app.get<{
    Params: OutletParamsSchemaType;
    Querystring: OutletItemScoresRunListQuerySchemaType;
  }>(
    "/outlets/:outletId/runs/outlet-item-scores",
    {
      schema: {
        params: OutletParamsSchema,
        querystring: OutletItemScoresRunListQuerySchema,
        response: { 200: OutletItemScoresRunListSchema },
      },
    },
    async (request) => {
      const pool = getPool();
      const runs = await getOutletItemScoresRuns(
        pool,
        request.params.outletId,
        request.query,
      );
      return { runs };
    },
  );

  // PUT: the resource is the outlet's live-run pointer, and publishing the same run again changes nothing.
  app.put<{
    Params: OutletParamsSchemaType;
    Body: PublishOutletItemScoresRunBodySchemaType;
  }>(
    "/outlets/:outletId/published-runs/outlet-item-scores",
    {
      schema: {
        params: OutletParamsSchema,
        body: PublishOutletItemScoresRunBodySchema,
        response: { 200: OutletItemScoresRunRecordSchema },
      },
    },
    (request) => {
      const pool = getPool();
      return publishOutletItemScoresRun(
        pool,
        request.params.outletId,
        request.body,
      );
    },
  );

  app.get<{ Params: RunParamsSchemaType }>(
    "/runs/:runId/outlet-item-scores",
    {
      schema: {
        params: RunParamsSchema,
        response: { 200: OutletItemScoresRunResultSchema },
      },
    },
    (request) => {
      const pool = getPool();
      return getOutletItemScoresRunResult(pool, request.params.runId);
    },
  );
}

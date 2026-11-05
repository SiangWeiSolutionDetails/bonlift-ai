import {
  BrandParamsSchema,
  BrandParamsSchemaType,
  ItemAffinityItemListSchema,
  ItemAffinityItemParamsSchema,
  ItemAffinityItemParamsSchemaType,
  ItemAffinityItemResultSchema,
  ItemAffinityRunListQuerySchema,
  ItemAffinityRunListQuerySchemaType,
  ItemAffinityRunListSchema,
  ItemAffinityRunRecordSchema,
  PublishItemAffinityRunBodySchema,
  PublishItemAffinityRunBodySchemaType,
  RunParamsSchema,
  RunParamsSchemaType,
} from "@bonlift-ai/contracts";
import { getPool } from "@bonlift-ai/db";
import { FastifyInstance } from "fastify";
import {
  getItemAffinityItemResult,
  getItemAffinityItems,
  getItemAffinityRuns,
  publishItemAffinityRun,
} from "../services/itemAffinityResult.service.js";

export async function itemAffinityResultRoutes(app: FastifyInstance) {
  app.get<{
    Params: BrandParamsSchemaType;
    Querystring: ItemAffinityRunListQuerySchemaType;
  }>(
    "/brands/:brandId/runs/item-affinity",
    {
      schema: {
        params: BrandParamsSchema,
        querystring: ItemAffinityRunListQuerySchema,
        response: { 200: ItemAffinityRunListSchema },
      },
    },
    async (request) => {
      const pool = getPool();
      const runs = await getItemAffinityRuns(
        pool,
        request.params.brandId,
        request.query,
      );
      return { runs };
    },
  );

  // PUT: the resource is the brand's live-run pointer, and publishing the same run again changes nothing.
  app.put<{
    Params: BrandParamsSchemaType;
    Body: PublishItemAffinityRunBodySchemaType;
  }>(
    "/brands/:brandId/published-runs/item-affinity",
    {
      schema: {
        params: BrandParamsSchema,
        body: PublishItemAffinityRunBodySchema,
        response: { 200: ItemAffinityRunRecordSchema },
      },
    },
    (request) => {
      const pool = getPool();
      return publishItemAffinityRun(pool, request.params.brandId, request.body);
    },
  );

  app.get<{ Params: RunParamsSchemaType }>(
    "/runs/:runId/item-affinity/items",
    {
      schema: {
        params: RunParamsSchema,
        response: { 200: ItemAffinityItemListSchema },
      },
    },
    (request) => {
      const pool = getPool();
      return getItemAffinityItems(pool, request.params.runId);
    },
  );

  app.get<{ Params: ItemAffinityItemParamsSchemaType }>(
    "/runs/:runId/item-affinity/items/:itemId",
    {
      schema: {
        params: ItemAffinityItemParamsSchema,
        response: { 200: ItemAffinityItemResultSchema },
      },
    },
    (request) => {
      const pool = getPool();
      return getItemAffinityItemResult(
        pool,
        request.params.runId,
        request.params.itemId,
      );
    },
  );
}

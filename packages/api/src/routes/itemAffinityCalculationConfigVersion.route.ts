import {
  BrandParamsSchema,
  BrandParamsSchemaType,
  CreateItemAffinityCalculationConfigVersionBodySchema,
  CreateItemAffinityCalculationConfigVersionBodySchemaType,
  ItemAffinityCalculationConfigVersionRecordSchema,
  ItemAffinityCalculationConfigVersionsSchema,
} from "@ai-services/contracts";
import { getPool } from "@ai-services/db";
import { FastifyInstance } from "fastify";
import {
  createItemAffinityCalculationConfigVersion,
  getItemAffinityCalculationConfigVersions,
  getLatestItemAffinityCalculationConfigVersion,
} from "../services/itemAffinityCalculationConfigVersion.service.js";

const PATH = "/brands/:brandId/calculation-configs/item-affinity";

export async function itemAffinityCalculationConfigVersionRoutes(
  app: FastifyInstance,
) {
  app.get<{ Params: BrandParamsSchemaType }>(
    PATH,
    {
      schema: {
        params: BrandParamsSchema,
        response: { 200: ItemAffinityCalculationConfigVersionRecordSchema },
      },
    },
    (request) => {
      const pool = getPool();
      return getLatestItemAffinityCalculationConfigVersion(
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
        response: { 200: ItemAffinityCalculationConfigVersionsSchema },
      },
    },
    (request) => {
      const pool = getPool();
      return getItemAffinityCalculationConfigVersions(
        pool,
        request.params.brandId,
      );
    },
  );

  app.patch<{
    Params: BrandParamsSchemaType;
    Body: CreateItemAffinityCalculationConfigVersionBodySchemaType;
  }>(
    PATH,
    {
      schema: {
        params: BrandParamsSchema,
        body: CreateItemAffinityCalculationConfigVersionBodySchema,
        response: { 201: ItemAffinityCalculationConfigVersionRecordSchema },
      },
    },
    async (request, reply) => {
      const pool = getPool();
      const version = await createItemAffinityCalculationConfigVersion(
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

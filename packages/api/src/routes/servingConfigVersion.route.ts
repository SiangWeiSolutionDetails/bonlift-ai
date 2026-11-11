import {
  BrandParamsSchema,
  BrandParamsSchemaType,
  CreateServingConfigVersionBodySchema,
  CreateServingConfigVersionBodySchemaType,
  ServingConfigVersionRecordSchema,
  ServingConfigVersionsSchema,
} from "@bonlift-ai/contracts";
import { getPool } from "@bonlift-ai/db";
import { FastifyInstance } from "fastify";
import {
  createServingConfigVersion,
  getServingConfigVersions,
  getLatestServingConfigVersion,
} from "../services/servingConfigVersion.service.js";

const PATH = "/brands/:brandId/serving-config";

export async function servingConfigVersionRoutes(
  app: FastifyInstance,
) {
  app.get<{ Params: BrandParamsSchemaType }>(
    PATH,
    {
      schema: {
        params: BrandParamsSchema,
        response: { 200: ServingConfigVersionRecordSchema },
      },
    },
    (request) => {
      const pool = getPool();
      return getLatestServingConfigVersion(
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
        response: { 200: ServingConfigVersionsSchema },
      },
    },
    (request) => {
      const pool = getPool();
      return getServingConfigVersions(
        pool,
        request.params.brandId,
      );
    },
  );

  app.patch<{
    Params: BrandParamsSchemaType;
    Body: CreateServingConfigVersionBodySchemaType;
  }>(
    PATH,
    {
      schema: {
        params: BrandParamsSchema,
        body: CreateServingConfigVersionBodySchema,
        response: { 201: ServingConfigVersionRecordSchema },
      },
    },
    async (request, reply) => {
      const pool = getPool();
      const version = await createServingConfigVersion(
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

import { getPool } from "@bonlift-ai/db";
import {
  removeBrandCalculationSchedule,
  syncBrandCalculationSchedule,
} from "@bonlift-ai/worker";
import { FastifyInstance } from "fastify";
import { syncBrandCalculationScheduleBestEffort } from "../services/brandCalculationSchedule.service.js";
import {
  createBrand,
  deleteBrand,
  getBrand,
  getBrands,
  updateBrand,
} from "../services/brand.service.js";
import {
  BrandListSchema,
  BrandParamsSchema,
  BrandParamsSchemaType,
  BrandQuerySchema,
  BrandQuerySchemaType,
  BrandRecordSchema,
  CreateBrandBodySchema,
  CreateBrandBodySchemaType,
  UpdateBrandBodySchema,
  UpdateBrandBodySchemaType,
} from "@bonlift-ai/contracts";

export async function brandRoutes(app: FastifyInstance) {
  app.get<{ Querystring: BrandQuerySchemaType }>(
    "/brands",
    {
      schema: {
        querystring: BrandQuerySchema,
        response: {
          200: BrandListSchema,
        },
      },
    },
    async (request) => {
      const pool = getPool();
      const brands = await getBrands(pool, {
        tenantId: request.query.tenantId,
      });
      return {
        brands,
      };
    },
  );

  app.get<{ Params: BrandParamsSchemaType }>(
    "/brands/:brandId",
    {
      schema: {
        params: BrandParamsSchema,
        response: { 200: BrandRecordSchema },
      },
    },
    (request) => {
      const pool = getPool();
      return getBrand(pool, request.params.brandId);
    },
  );

  app.post<{ Body: CreateBrandBodySchemaType }>(
    "/brands",
    {
      schema: {
        body: CreateBrandBodySchema,
        response: { 201: BrandRecordSchema },
      },
    },
    async (request, reply) => {
      const pool = getPool();
      const brand = await createBrand(pool, request.body);
      // Best effort: Redis being down must not fail the brand; the worker's startup reconcile schedules it later.
      if (!(await syncBrandCalculationScheduleBestEffort(pool, syncBrandCalculationSchedule, brand.id))) {
        request.log.warn({ brandId: brand.id }, "Calculation schedule not synced; the worker will reconcile it");
      }
      reply.status(201);
      return brand;
    },
  );

  app.patch<{
    Params: BrandParamsSchemaType;
    Body: UpdateBrandBodySchemaType;
  }>(
    "/brands/:brandId",
    {
      schema: {
        params: BrandParamsSchema,
        body: UpdateBrandBodySchema,
        response: { 200: BrandRecordSchema },
      },
    },
    (request) => {
      const pool = getPool();
      return updateBrand(pool, request.params.brandId, request.body);
    },
  );

  // Soft delete: the brand and its outlets read as not found from then on.
  app.delete<{ Params: BrandParamsSchemaType }>(
    "/brands/:brandId",
    {
      schema: {
        params: BrandParamsSchema,
      },
    },
    async (request, reply) => {
      const pool = getPool();
      await deleteBrand(pool, request.params.brandId);
      // Best effort: a scheduler left behind removes itself the next time it fires for the deleted brand.
      await removeBrandCalculationSchedule(request.params.brandId).catch((error) => {
        request.log.warn({ err: error, brandId: request.params.brandId }, "Calculation schedule not removed");
      });
      return reply.status(204).send();
    },
  );
}

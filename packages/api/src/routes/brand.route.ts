import { getPool } from "@ai-services/db";
import { FastifyInstance } from "fastify";
import {
  createBrand,
  getBrand,
  getBrands,
  updateBrand,
} from "../services/brand.service.js";
import {
  BrandListSchema,
  BrandParamsSchema,
  BrandParamsSchemaType,
  BrandRecordSchema,
  CreateBrandBodySchema,
  CreateBrandBodySchemaType,
  UpdateBrandBodySchema,
  UpdateBrandBodySchemaType,
} from "../schemas/brand.schema.js";

export async function brandRoutes(app: FastifyInstance) {
  app.get(
    "/brands",
    {
      schema: {
        response: {
          200: BrandListSchema,
        },
      },
    },
    async () => {
      const pool = getPool();
      const brands = await getBrands(pool);
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
}

import { getPool } from "@ai-services/db";
import { FastifyInstance } from "fastify";
import {
  createBrand,
  getBrand,
  getBrands,
  updateBrand,
} from "../services/brand.service.js";

const listQuerySchema = {
  type: "object",
  properties: {
    includeInactive: { type: "boolean" },
  },
} as const;

const paramsSchema = {
  type: "object",
  properties: {
    brandId: { type: "string" },
  },
  required: ["brandId"],
} as const;

const brandRecordSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    isActive: { type: "boolean" },
  },
} as const;

const createBodySchema = {
  type: "object",
  properties: {
    name: { type: "string", minLength: 1 },
  },
  required: ["name"],
  additionalProperties: false,
} as const;

const updateBodySchema = {
  type: "object",
  properties: {
    name: { type: "string", minLength: 1 },
    isActive: { type: "boolean" },
  },
  additionalProperties: false,
  minProperties: 1,
} as const;

export async function brandRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { includeInactive: boolean } }>(
    "/brands",
    {
      schema: {
        querystring: listQuerySchema,
        response: {
          200: {
            type: "object",
            properties: {
              brands: {
                type: "array",
                items: brandRecordSchema,
              },
            },
            required: ["brands"],
          },
        },
      },
    },
    async (request) => {
      const pool = getPool();
      const brands = await getBrands(pool, {
        includeInactive: Boolean(request.query.includeInactive) ?? false,
      });
      return {
        brands,
      };
    },
  );

  app.get<{ Params: { brandId: string } }>(
    "/brands/:brandId",
    {
      schema: {
        params: paramsSchema,
        response: { 200: brandRecordSchema },
      },
    },
    (request) => {
      const pool = getPool();
      return getBrand(pool, request.params.brandId, {
        includeInactive: true,
      });
    },
  );

  app.post<{ Body: { name: string } }>(
    "/brands",
    { schema: { body: createBodySchema } },
    (request) => {
      const pool = getPool();
      return createBrand(pool, request.body);
    },
  );

  app.patch<{
    Params: { brandId: string };
    Body: { name?: string; isActive?: boolean };
  }>(
    "/brands/:brandId",
    {
      schema: {
        params: paramsSchema,
        body: updateBodySchema,
        response: { 200: brandRecordSchema },
      },
    },
    (request) => {
      const pool = getPool();
      return updateBrand(pool, request.params.brandId, request.body);
    },
  );
}

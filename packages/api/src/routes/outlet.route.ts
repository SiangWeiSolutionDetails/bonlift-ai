import { FastifyInstance } from "fastify";
import {
  createOutlet,
  getOutlet,
  getOutlets,
  updateOutlet,
} from "../services/outlet.service.js";
import { getPool } from "@ai-services/db";
import {
  CreateOutletBodySchema,
  CreateOutletBodySchemaType,
  OutletListSchema,
  OutletParamsSchema,
  OutletParamsSchemaType,
  OutletQuerySchema,
  OutletQuerySchemaType,
  OutletRecordSchema,
  UpdateOutletBodySchema,
  UpdateOutletBodySchemaType,
} from "../schemas/outlet.schema.js";

export async function outletRoutes(app: FastifyInstance) {
  app.get<{ Querystring: OutletQuerySchemaType }>(
    "/outlets",
    {
      schema: {
        querystring: OutletQuerySchema,
        response: { 200: OutletListSchema },
      },
    },
    async (request) => {
      const pool = getPool();
      const outlets = await getOutlets(pool, {
        tenantId: request.query.tenantId,
        brandId: request.query.brandId,
      });
      return {
        outlets,
      };
    },
  );

  app.get<{ Params: OutletParamsSchemaType }>(
    "/outlets/:outletId",
    {
      schema: {
        params: OutletParamsSchema,
        response: { 200: OutletRecordSchema },
      },
    },
    (request) => {
      const pool = getPool();
      return getOutlet(pool, request.params.outletId);
    },
  );

  app.post<{
    Body: CreateOutletBodySchemaType;
  }>(
    "/outlets",
    {
      schema: {
        body: CreateOutletBodySchema,
        response: { 201: OutletRecordSchema },
      },
    },
    async (request, reply) => {
      const pool = getPool();
      const outlet = await createOutlet(pool, request.body);
      reply.status(201);
      return outlet;
    },
  );

  app.patch<{
    Params: OutletParamsSchemaType;
    Body: UpdateOutletBodySchemaType;
  }>(
    "/outlets/:outletId",
    {
      schema: {
        params: OutletParamsSchema,
        body: UpdateOutletBodySchema,
        response: { 200: OutletRecordSchema },
      },
    },
    (request) => {
      const pool = getPool();
      return updateOutlet(pool, request.params.outletId, request.body);
    },
  );
}

import { getPool } from "@ai-services/db";
import { FastifyInstance } from "fastify";
import {
  createTenant,
  getTenant,
  getTenants,
  updateTenant,
} from "../services/tenant.service.js";
import {
  CreateTenantBodySchema,
  CreateTenantBodySchemaType,
  TenantListSchema,
  TenantParamsSchema,
  TenantParamsSchemaType,
  TenantQuerySchema,
  TenantRecordSchema,
  UpdateTenantBodySchema,
  UpdateTenantBodySchemaType,
} from "../schemas/tenant.schema.js";

export async function tenantRoutes(app: FastifyInstance) {
  app.get(
    "/tenants",
    {
      schema: {
        querystring: TenantQuerySchema,
        response: { 200: TenantListSchema },
      },
    },
    async () => {
      const pool = getPool();
      const tenants = await getTenants(pool);
      return { tenants };
    },
  );

  app.get<{ Params: TenantParamsSchemaType }>(
    "/tenants/:tenantId",
    {
      schema: {
        params: TenantParamsSchema,
        response: { 200: TenantRecordSchema },
      },
    },
    (request) => {
      const pool = getPool();
      return getTenant(pool, request.params.tenantId);
    },
  );

  app.post<{ Body: CreateTenantBodySchemaType }>(
    "/tenants",
    {
      schema: {
        body: CreateTenantBodySchema,
        response: { 201: TenantRecordSchema },
      },
    },
    async (request, reply) => {
      const pool = getPool();
      const tenant = await createTenant(pool, request.body);
      reply.status(201);
      return tenant;
    },
  );

  app.patch<{
    Params: TenantParamsSchemaType;
    Body: UpdateTenantBodySchemaType;
  }>(
    "/tenants/:tenantId",
    {
      schema: {
        params: TenantParamsSchema,
        body: UpdateTenantBodySchema,
        response: { 200: TenantRecordSchema },
      },
    },
    (request) => {
      const pool = getPool();
      return updateTenant(pool, request.params.tenantId, request.body);
    },
  );
}

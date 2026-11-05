import { getPool } from "@bonlift-ai/db";
import { FastifyInstance } from "fastify";
import {
  createTenant,
  deleteTenant,
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
} from "@bonlift-ai/contracts";

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

  // Soft delete: the tenant, its brands and its outlets read as not found from then on.
  app.delete<{ Params: TenantParamsSchemaType }>(
    "/tenants/:tenantId",
    {
      schema: {
        params: TenantParamsSchema,
      },
    },
    async (request, reply) => {
      const pool = getPool();
      await deleteTenant(pool, request.params.tenantId);
      return reply.status(204).send();
    },
  );
}

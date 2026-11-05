import {
  BrandApiKeyListSchema,
  BrandApiKeyParamsSchema,
  BrandApiKeyParamsSchemaType,
  BrandApiKeyRecordSchema,
  BrandParamsSchema,
  BrandParamsSchemaType,
  CreateBrandApiKeyBodySchema,
  CreateBrandApiKeyBodySchemaType,
  CreatedBrandApiKeySchema,
} from "@bonlift-ai/contracts";
import { getPool } from "@bonlift-ai/db";
import { FastifyInstance } from "fastify";
import {
  createBrandApiKey,
  deleteBrandApiKey,
  listBrandApiKeys,
  revokeBrandApiKeyById,
} from "../services/brandApiKey.service.js";

// Registered outside production only until admin login exists (H1): with no login, these routes would let
// anyone who can reach the API create a key for any brand. Production uses the api-key command line script.
export async function brandApiKeyRoutes(app: FastifyInstance) {
  app.get<{ Params: BrandParamsSchemaType }>(
    "/brands/:brandId/api-keys",
    {
      schema: {
        params: BrandParamsSchema,
        response: { 200: BrandApiKeyListSchema },
      },
    },
    (request) => {
      const pool = getPool();
      return listBrandApiKeys(pool, request.params.brandId);
    },
  );

  app.post<{
    Params: BrandParamsSchemaType;
    Body: CreateBrandApiKeyBodySchemaType;
  }>(
    "/brands/:brandId/api-keys",
    {
      schema: {
        params: BrandParamsSchema,
        body: CreateBrandApiKeyBodySchema,
        response: { 201: CreatedBrandApiKeySchema },
      },
    },
    async (request, reply) => {
      const pool = getPool();
      const created = await createBrandApiKey(pool, {
        brandId: request.params.brandId,
        ...request.body,
        // Placeholder until admin login (H1) identifies the user.
        createdBy: "admin",
      });
      // The only response that carries the secret: no browser or proxy may keep a copy.
      reply.status(201).header("Cache-Control", "no-store");
      return created;
    },
  );

  app.post<{ Params: BrandApiKeyParamsSchemaType }>(
    "/brands/:brandId/api-keys/:keyId/revoke",
    {
      schema: {
        params: BrandApiKeyParamsSchema,
        response: { 200: BrandApiKeyRecordSchema },
      },
    },
    (request) => {
      const pool = getPool();
      return revokeBrandApiKeyById(
        pool,
        request.params.brandId,
        request.params.keyId,
      );
    },
  );

  // 409 for a live key: it must be revoked first.
  app.delete<{ Params: BrandApiKeyParamsSchemaType }>(
    "/brands/:brandId/api-keys/:keyId",
    {
      schema: {
        params: BrandApiKeyParamsSchema,
      },
    },
    async (request, reply) => {
      const pool = getPool();
      await deleteBrandApiKey(pool, request.params.brandId, request.params.keyId);
      return reply.status(204).send();
    },
  );
}

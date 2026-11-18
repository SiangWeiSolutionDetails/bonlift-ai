import { getPool } from "@bonlift-ai/db";
import { FastifyInstance } from "fastify";
import {
  AddBrandUserBodySchema,
  AddBrandUserBodySchemaType,
  BrandUserListSchema,
  BrandUserParamsSchema,
  BrandUserParamsSchemaType,
  BrandUserRecordSchema,
  BrandParamsSchema,
  BrandParamsSchemaType,
  SetBrandUserBodySchema,
  SetBrandUserBodySchemaType,
  UserBrandRoleListSchema,
  UserParamsSchema,
  UserParamsSchemaType,
} from "@bonlift-ai/contracts";
import type { RouteAccess } from "../services/authorization.service.js";
import {
  addBrandUser,
  listBrandUsers,
  listUserBrandRoles,
  removeBrandUser,
  setBrandUser,
} from "../services/brandUser.service.js";

const MANAGE_BRAND_USERS: RouteAccess = {
  anyOf: [{ console: "users.assignBrandRoles" }, { brand: "brandUsers.manage", from: "params.brandId" }],
};

export async function brandUserRoutes(app: FastifyInstance) {
  app.get<{ Params: BrandParamsSchemaType }>(
    "/brands/:brandId/users",
    {
      config: {
        access: { anyOf: [{ console: "users.view" }, { brand: "brandUsers.view", from: "params.brandId" }] },
      },
      schema: {
        params: BrandParamsSchema,
        response: { 200: BrandUserListSchema },
      },
    },
    (request) => listBrandUsers(getPool(), request.params.brandId),
  );

  app.post<{ Params: BrandParamsSchemaType; Body: AddBrandUserBodySchemaType }>(
    "/brands/:brandId/users",
    {
      config: { access: MANAGE_BRAND_USERS },
      schema: {
        params: BrandParamsSchema,
        body: AddBrandUserBodySchema,
        response: { 201: BrandUserRecordSchema },
      },
    },
    async (request, reply) => {
      const brandUser = await addBrandUser(
        getPool(),
        request.access!,
        request.brandActions,
        request.params.brandId,
        request.body,
      );
      reply.status(201);
      return brandUser;
    },
  );

  app.put<{ Params: BrandUserParamsSchemaType; Body: SetBrandUserBodySchemaType }>(
    "/brands/:brandId/users/:userId",
    {
      config: { access: MANAGE_BRAND_USERS },
      schema: {
        params: BrandUserParamsSchema,
        body: SetBrandUserBodySchema,
        response: { 200: BrandUserRecordSchema },
      },
    },
    (request) =>
      setBrandUser(
        getPool(),
        request.access!,
        request.brandActions,
        request.params.brandId,
        request.params.userId,
        request.body.roleId,
      ),
  );

  app.delete<{ Params: BrandUserParamsSchemaType }>(
    "/brands/:brandId/users/:userId",
    {
      config: { access: MANAGE_BRAND_USERS },
      schema: {
        params: BrandUserParamsSchema,
      },
    },
    async (request, reply) => {
      await removeBrandUser(
        getPool(),
        request.access!,
        request.brandActions,
        request.params.brandId,
        request.params.userId,
      );
      return reply.status(204).send();
    },
  );

  app.get<{ Params: UserParamsSchemaType }>(
    "/users/:userId/brand-roles",
    {
      config: { access: { console: "users.view" } },
      schema: {
        params: UserParamsSchema,
        response: { 200: UserBrandRoleListSchema },
      },
    },
    (request) => listUserBrandRoles(getPool(), request.params.userId),
  );
}

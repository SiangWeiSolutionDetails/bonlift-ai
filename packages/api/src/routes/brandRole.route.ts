import { getPool } from "@bonlift-ai/db";
import { FastifyInstance } from "fastify";
import {
  BrandParamsSchema,
  BrandParamsSchemaType,
  BrandRoleParamsSchema,
  BrandRoleParamsSchemaType,
  CreateRoleBodySchema,
  CreateRoleBodySchemaType,
  RoleAssignmentListSchema,
  RoleListSchema,
  RoleRecordSchema,
  UpdateRoleBodySchema,
  UpdateRoleBodySchemaType,
} from "@bonlift-ai/contracts";
import type { RouteAccess } from "../services/authorization.service.js";
import {
  createBrandRole,
  deleteBrandRole,
  listBrandRoleAssignments,
  listBrandRoles,
  updateBrandRole,
} from "../services/brandRole.service.js";

// Provider view grants brandRoles.view and provider support brandRoles.manage, through the brand check.
const VIEW_ROLES: RouteAccess = { brand: "brandRoles.view", from: "params.brandId" };
const MANAGE_ROLES: RouteAccess = { brand: "brandRoles.manage", from: "params.brandId" };
// Console users who assign brand roles pick from this list on the Users page, without a role on the brand
const LIST_ROLES: RouteAccess = { anyOf: [{ console: "users.assignBrandRoles" }, VIEW_ROLES] };

export async function brandRoleRoutes(app: FastifyInstance) {
  app.get<{ Params: BrandParamsSchemaType }>(
    "/brands/:brandId/roles",
    {
      config: { access: LIST_ROLES },
      schema: {
        params: BrandParamsSchema,
        response: { 200: RoleListSchema },
      },
    },
    async (request) => {
      const roles = await listBrandRoles(getPool(), request.params.brandId);
      return { roles };
    },
  );

  // The service also requires brandUsers.view on the brand.
  app.get<{ Params: BrandRoleParamsSchemaType }>(
    "/brands/:brandId/roles/:roleId/assignments",
    {
      config: { access: VIEW_ROLES },
      schema: {
        params: BrandRoleParamsSchema,
        response: { 200: RoleAssignmentListSchema },
      },
    },
    (request) =>
      listBrandRoleAssignments(
        getPool(),
        request.access!,
        request.brandActions,
        request.params.brandId,
        request.params.roleId,
      ),
  );

  app.post<{ Params: BrandParamsSchemaType; Body: CreateRoleBodySchemaType }>(
    "/brands/:brandId/roles",
    {
      config: { access: MANAGE_ROLES },
      schema: {
        params: BrandParamsSchema,
        body: CreateRoleBodySchema,
        response: { 201: RoleRecordSchema },
      },
    },
    async (request, reply) => {
      const role = await createBrandRole(
        getPool(),
        request.access!,
        request.brandActions,
        request.params.brandId,
        request.body,
      );
      reply.status(201);
      return role;
    },
  );

  app.patch<{ Params: BrandRoleParamsSchemaType; Body: UpdateRoleBodySchemaType }>(
    "/brands/:brandId/roles/:roleId",
    {
      config: { access: MANAGE_ROLES },
      schema: {
        params: BrandRoleParamsSchema,
        body: UpdateRoleBodySchema,
        response: { 200: RoleRecordSchema },
      },
    },
    (request) =>
      updateBrandRole(
        getPool(),
        request.access!,
        request.brandActions,
        request.params.brandId,
        request.params.roleId,
        request.body,
      ),
  );

  app.delete<{ Params: BrandRoleParamsSchemaType }>(
    "/brands/:brandId/roles/:roleId",
    {
      config: { access: MANAGE_ROLES },
      schema: {
        params: BrandRoleParamsSchema,
      },
    },
    async (request, reply) => {
      await deleteBrandRole(
        getPool(),
        request.access!,
        request.brandActions,
        request.params.brandId,
        request.params.roleId,
      );
      return reply.status(204).send();
    },
  );
}

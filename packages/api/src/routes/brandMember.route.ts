import { getPool } from "@bonlift-ai/db";
import { FastifyInstance } from "fastify";
import {
  AddBrandMemberBodySchema,
  AddBrandMemberBodySchemaType,
  BrandMemberListSchema,
  BrandMemberParamsSchema,
  BrandMemberParamsSchemaType,
  BrandMemberRecordSchema,
  BrandParamsSchema,
  BrandParamsSchemaType,
  SetBrandMemberBodySchema,
  SetBrandMemberBodySchemaType,
  UserBrandRoleListSchema,
  UserParamsSchema,
  UserParamsSchemaType,
} from "@bonlift-ai/contracts";
import type { RouteAccess } from "../services/authorization.service.js";
import {
  addBrandMember,
  listBrandMembers,
  listUserBrandRoles,
  removeBrandMember,
  setBrandMember,
} from "../services/brandMember.service.js";

const MANAGE_MEMBERS: RouteAccess = {
  anyOf: [{ console: "users.assignBrandRoles" }, { brand: "members.manage", from: "params.brandId" }],
};

export async function brandMemberRoutes(app: FastifyInstance) {
  app.get<{ Params: BrandParamsSchemaType }>(
    "/brands/:brandId/members",
    {
      config: {
        access: { anyOf: [{ console: "users.view" }, { brand: "members.view", from: "params.brandId" }] },
      },
      schema: {
        params: BrandParamsSchema,
        response: { 200: BrandMemberListSchema },
      },
    },
    (request) => listBrandMembers(getPool(), request.params.brandId),
  );

  app.post<{ Params: BrandParamsSchemaType; Body: AddBrandMemberBodySchemaType }>(
    "/brands/:brandId/members",
    {
      config: { access: MANAGE_MEMBERS },
      schema: {
        params: BrandParamsSchema,
        body: AddBrandMemberBodySchema,
        response: { 201: BrandMemberRecordSchema },
      },
    },
    async (request, reply) => {
      const member = await addBrandMember(
        getPool(),
        request.access!,
        request.brandActions,
        request.params.brandId,
        request.body,
      );
      reply.status(201);
      return member;
    },
  );

  app.put<{ Params: BrandMemberParamsSchemaType; Body: SetBrandMemberBodySchemaType }>(
    "/brands/:brandId/members/:userId",
    {
      config: { access: MANAGE_MEMBERS },
      schema: {
        params: BrandMemberParamsSchema,
        body: SetBrandMemberBodySchema,
        response: { 200: BrandMemberRecordSchema },
      },
    },
    (request) =>
      setBrandMember(
        getPool(),
        request.access!,
        request.brandActions,
        request.params.brandId,
        request.params.userId,
        request.body.roleId,
      ),
  );

  app.delete<{ Params: BrandMemberParamsSchemaType }>(
    "/brands/:brandId/members/:userId",
    {
      config: { access: MANAGE_MEMBERS },
      schema: {
        params: BrandMemberParamsSchema,
      },
    },
    async (request, reply) => {
      await removeBrandMember(
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

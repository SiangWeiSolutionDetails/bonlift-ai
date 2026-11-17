import { getPool } from "@bonlift-ai/db";
import { FastifyInstance } from "fastify";
import {
  CreateRoleBodySchema,
  CreateRoleBodySchemaType,
  RoleAssignmentListSchema,
  RoleListSchema,
  RoleParamsSchema,
  RoleParamsSchemaType,
  RoleQuerySchema,
  RoleQuerySchemaType,
  RoleRecordSchema,
  UpdateRoleBodySchema,
  UpdateRoleBodySchemaType,
} from "@bonlift-ai/contracts";
import { createRole, deleteRole, listRoleAssignments, listRoles, updateRole } from "../services/role.service.js";

export async function roleRoutes(app: FastifyInstance) {
  app.get<{ Querystring: RoleQuerySchemaType }>(
    "/roles",
    {
      config: { access: { console: "roles.view" } },
      schema: {
        querystring: RoleQuerySchema,
        response: { 200: RoleListSchema },
      },
    },
    async (request) => {
      const roles = await listRoles(getPool(), request.query.kind);
      return { roles };
    },
  );

  app.get<{ Params: RoleParamsSchemaType }>(
    "/roles/:roleId/assignments",
    {
      config: { access: { console: "roles.view" } },
      schema: {
        params: RoleParamsSchema,
        response: { 200: RoleAssignmentListSchema },
      },
    },
    (request) => listRoleAssignments(getPool(), request.access!, request.params.roleId),
  );

  app.post<{ Body: CreateRoleBodySchemaType }>(
    "/roles",
    {
      config: { access: { console: "roles.manage" } },
      schema: {
        body: CreateRoleBodySchema,
        response: { 201: RoleRecordSchema },
      },
    },
    async (request, reply) => {
      const role = await createRole(getPool(), request.access!, request.body);
      reply.status(201);
      return role;
    },
  );

  app.patch<{ Params: RoleParamsSchemaType; Body: UpdateRoleBodySchemaType }>(
    "/roles/:roleId",
    {
      config: { access: { console: "roles.manage" } },
      schema: {
        params: RoleParamsSchema,
        body: UpdateRoleBodySchema,
        response: { 200: RoleRecordSchema },
      },
    },
    (request) => updateRole(getPool(), request.access!, request.params.roleId, request.body),
  );

  app.delete<{ Params: RoleParamsSchemaType }>(
    "/roles/:roleId",
    {
      config: { access: { console: "roles.manage" } },
      schema: {
        params: RoleParamsSchema,
      },
    },
    async (request, reply) => {
      await deleteRole(getPool(), request.access!, request.params.roleId);
      return reply.status(204).send();
    },
  );
}

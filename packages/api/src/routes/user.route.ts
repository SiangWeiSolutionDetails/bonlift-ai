import { getPool } from "@bonlift-ai/db";
import { FastifyInstance } from "fastify";
import {
  InviteUserBodySchema,
  InviteUserBodySchemaType,
  SetConsoleRoleBodySchema,
  SetConsoleRoleBodySchemaType,
  UserListSchema,
  UserParamsSchema,
  UserParamsSchemaType,
  UpdateUserBodySchema,
  UpdateUserBodySchemaType,
  UserRecordSchema,
} from "@bonlift-ai/contracts";
import {
  clearConsoleRole,
  deleteUser,
  disableUser,
  inviteUser,
  listUsers,
  reinviteUser,
  setConsoleRole,
  updateUser,
} from "../services/user.service.js";

export async function userRoutes(app: FastifyInstance) {
  app.get(
    "/users",
    {
      config: { access: { console: "users.view" } },
      schema: {
        response: { 200: UserListSchema },
      },
    },
    async () => {
      const users = await listUsers(getPool());
      return { users };
    },
  );

  app.post<{ Body: InviteUserBodySchemaType }>(
    "/users",
    {
      config: { access: { console: "users.invite" } },
      schema: {
        body: InviteUserBodySchema,
        response: { 201: UserRecordSchema },
      },
    },
    async (request, reply) => {
      const user = await inviteUser(getPool(), request.body);
      reply.status(201);
      return user;
    },
  );

  app.patch<{ Params: UserParamsSchemaType; Body: UpdateUserBodySchemaType }>(
    "/users/:userId",
    {
      config: { access: { console: "users.edit" } },
      schema: {
        params: UserParamsSchema,
        body: UpdateUserBodySchema,
        response: { 200: UserRecordSchema },
      },
    },
    (request) => updateUser(getPool(), request.access!, request.params.userId, request.body),
  );

  app.post<{ Params: UserParamsSchemaType }>(
    "/users/:userId/reinvite",
    {
      config: { access: { console: "users.invite" } },
      schema: {
        params: UserParamsSchema,
        response: { 200: UserRecordSchema },
      },
    },
    (request) => reinviteUser(getPool(), request.access!, request.params.userId),
  );

  app.post<{ Params: UserParamsSchemaType }>(
    "/users/:userId/disable",
    {
      config: { access: { console: "users.disable" } },
      schema: {
        params: UserParamsSchema,
        response: { 200: UserRecordSchema },
      },
    },
    (request) => disableUser(getPool(), request.access!, request.params.userId),
  );

  app.delete<{ Params: UserParamsSchemaType }>(
    "/users/:userId",
    {
      config: { access: { console: "users.delete" } },
      schema: {
        params: UserParamsSchema,
      },
    },
    async (request, reply) => {
      await deleteUser(getPool(), request.access!, request.params.userId);
      return reply.status(204).send();
    },
  );

  app.put<{ Params: UserParamsSchemaType; Body: SetConsoleRoleBodySchemaType }>(
    "/users/:userId/console-role",
    {
      config: { access: { console: "users.assignConsoleRoles" } },
      schema: {
        params: UserParamsSchema,
        body: SetConsoleRoleBodySchema,
        response: { 200: UserRecordSchema },
      },
    },
    (request) => setConsoleRole(getPool(), request.access!, request.params.userId, request.body.roleId),
  );

  app.delete<{ Params: UserParamsSchemaType }>(
    "/users/:userId/console-role",
    {
      config: { access: { console: "users.assignConsoleRoles" } },
      schema: {
        params: UserParamsSchema,
      },
    },
    async (request, reply) => {
      await clearConsoleRole(getPool(), request.access!, request.params.userId);
      return reply.status(204).send();
    },
  );
}

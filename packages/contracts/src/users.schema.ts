import Type, { type Static } from "typebox";
import { NameSchema } from "./name.schema.js";

export const UserStatusSchema = Type.Union([
  Type.Literal("invited"),
  Type.Literal("active"),
  Type.Literal("disabled"),
]);
export type UserStatus = Static<typeof UserStatusSchema>;

const ConsoleRoleSummarySchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    name: Type.String(),
    isBuiltin: Type.Boolean(),
  },
  { additionalProperties: false },
);

export const UserRecordSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    email: Type.String(),
    displayName: Type.Union([Type.String(), Type.Null()]),
    status: UserStatusSchema,
    lastLoginAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
    consoleRole: Type.Union([ConsoleRoleSummarySchema, Type.Null()]),
    brandCount: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);
export type UserRecordSchemaType = Static<typeof UserRecordSchema>;

export const UserListSchema = Type.Object({
  users: Type.Array(UserRecordSchema),
});
export type UserListSchemaType = Static<typeof UserListSchema>;

export const UserParamsSchema = Type.Object({
  userId: Type.String({ format: "uuid" }),
});
export type UserParamsSchemaType = Static<typeof UserParamsSchema>;

export const InviteUserBodySchema = Type.Object(
  {
    email: Type.String({ format: "email", maxLength: 320 }),
    displayName: Type.Optional(NameSchema),
  },
  { additionalProperties: false },
);
export type InviteUserBodySchemaType = Static<typeof InviteUserBodySchema>;

export const SetConsoleRoleBodySchema = Type.Object(
  {
    roleId: Type.String({ format: "uuid" }),
  },
  { additionalProperties: false },
);
export type SetConsoleRoleBodySchemaType = Static<typeof SetConsoleRoleBodySchema>;

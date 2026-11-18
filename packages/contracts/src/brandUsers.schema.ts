import Type, { type Static } from "typebox";
import { NameSchema } from "./name.schema.js";
import { UserStatusSchema } from "./users.schema.js";

export const BrandUserRecordSchema = Type.Object(
  {
    userId: Type.String({ format: "uuid" }),
    email: Type.String(),
    displayName: Type.Union([Type.String(), Type.Null()]),
    status: UserStatusSchema,
    roleId: Type.String({ format: "uuid" }),
    roleName: Type.String(),
  },
  { additionalProperties: false },
);
export type BrandUserRecordSchemaType = Static<typeof BrandUserRecordSchema>;

export const BrandUserListSchema = Type.Array(BrandUserRecordSchema);
export type BrandUserListSchemaType = Static<typeof BrandUserListSchema>;

export const BrandUserParamsSchema = Type.Object({
  brandId: Type.String({ format: "uuid" }),
  userId: Type.String({ format: "uuid" }),
});
export type BrandUserParamsSchemaType = Static<typeof BrandUserParamsSchema>;

export const SetBrandUserBodySchema = Type.Object(
  {
    roleId: Type.String({ format: "uuid" }),
  },
  { additionalProperties: false },
);
export type SetBrandUserBodySchemaType = Static<typeof SetBrandUserBodySchema>;

export const AddBrandUserBodySchema = Type.Object(
  {
    email: Type.String({ format: "email", maxLength: 320 }),
    displayName: Type.Optional(NameSchema),
    roleId: Type.String({ format: "uuid" }),
  },
  { additionalProperties: false },
);
export type AddBrandUserBodySchemaType = Static<typeof AddBrandUserBodySchema>;

export const UserBrandRoleRecordSchema = Type.Object(
  {
    brandId: Type.String({ format: "uuid" }),
    brandName: Type.String(),
    tenantId: Type.String({ format: "uuid" }),
    tenantName: Type.String(),
    roleId: Type.String({ format: "uuid" }),
    roleName: Type.String(),
  },
  { additionalProperties: false },
);
export type UserBrandRoleRecordSchemaType = Static<typeof UserBrandRoleRecordSchema>;

export const UserBrandRoleListSchema = Type.Array(UserBrandRoleRecordSchema);
export type UserBrandRoleListSchemaType = Static<typeof UserBrandRoleListSchema>;

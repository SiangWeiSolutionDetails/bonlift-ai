import Type, { type Static } from "typebox";
import { NameSchema } from "./name.schema.js";
import { UserStatusSchema } from "./users.schema.js";

export const BrandMemberRecordSchema = Type.Object(
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
export type BrandMemberRecordSchemaType = Static<typeof BrandMemberRecordSchema>;

export const BrandMemberListSchema = Type.Array(BrandMemberRecordSchema);
export type BrandMemberListSchemaType = Static<typeof BrandMemberListSchema>;

export const BrandMemberParamsSchema = Type.Object({
  brandId: Type.String({ format: "uuid" }),
  userId: Type.String({ format: "uuid" }),
});
export type BrandMemberParamsSchemaType = Static<typeof BrandMemberParamsSchema>;

export const SetBrandMemberBodySchema = Type.Object(
  {
    roleId: Type.String({ format: "uuid" }),
  },
  { additionalProperties: false },
);
export type SetBrandMemberBodySchemaType = Static<typeof SetBrandMemberBodySchema>;

export const AddBrandMemberBodySchema = Type.Object(
  {
    email: Type.String({ format: "email", maxLength: 320 }),
    displayName: Type.Optional(NameSchema),
    roleId: Type.String({ format: "uuid" }),
  },
  { additionalProperties: false },
);
export type AddBrandMemberBodySchemaType = Static<typeof AddBrandMemberBodySchema>;

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

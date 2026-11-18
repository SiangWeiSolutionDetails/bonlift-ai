import Type, { type Static } from "typebox";

export const AuthProviderSchema = Type.Union([Type.Literal("google"), Type.Literal("microsoft")]);
export type AuthProvider = Static<typeof AuthProviderSchema>;

export const AuthProviderParamsSchema = Type.Object({
  provider: AuthProviderSchema,
});
export type AuthProviderParamsSchemaType = Static<typeof AuthProviderParamsSchema>;

export const AuthLoginQuerySchema = Type.Object({
  returnTo: Type.Optional(Type.String()),
  selectAccount: Type.Optional(Type.Literal("1")),
  loginHint: Type.Optional(Type.String({ format: "email", maxLength: 254 })),
});
export type AuthLoginQuerySchemaType = Static<typeof AuthLoginQuerySchema>;

export const AuthProvidersResponseSchema = Type.Object(
  { google: Type.Boolean(), microsoft: Type.Boolean() },
  { additionalProperties: false },
);
export type AuthProvidersResponseSchemaType = Static<typeof AuthProvidersResponseSchema>;

const ConsoleAccessSchema = Type.Object(
  {
    roleId: Type.String({ format: "uuid" }),
    roleName: Type.String(),
    isAdmin: Type.Boolean(),
    actions: Type.Array(Type.String()),
  },
  { additionalProperties: false },
);

const BrandAccessSchema = Type.Object(
  {
    brandId: Type.String({ format: "uuid" }),
    brandName: Type.String(),
    tenantId: Type.String({ format: "uuid" }),
    tenantName: Type.String(),
    roleId: Type.String({ format: "uuid" }),
    roleName: Type.String(),
    actions: Type.Array(Type.String()),
  },
  { additionalProperties: false },
);

export const AuthMeResponseSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    email: Type.String(),
    displayName: Type.Union([Type.String(), Type.Null()]),
    provider: AuthProviderSchema,
    nameLocked: Type.Boolean(),
    needsNameConfirmation: Type.Boolean(),
    console: Type.Union([ConsoleAccessSchema, Type.Null()]),
    brands: Type.Array(BrandAccessSchema),
  },
  { additionalProperties: false },
);
export type AuthMeResponseSchemaType = Static<typeof AuthMeResponseSchema>;

// Length is checked after trimming, in the service.
export const UpdateOwnNameBodySchema = Type.Object(
  {
    displayName: Type.String(),
  },
  { additionalProperties: false },
);
export type UpdateOwnNameBodySchemaType = Static<typeof UpdateOwnNameBodySchema>;

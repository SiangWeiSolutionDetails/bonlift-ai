import Type, { type Static } from "typebox";

export const AuthProviderParamsSchema = Type.Object({
  provider: Type.Literal("google"),
});
export type AuthProviderParamsSchemaType = Static<typeof AuthProviderParamsSchema>;

export const AuthLoginQuerySchema = Type.Object({
  returnTo: Type.Optional(Type.String()),
});
export type AuthLoginQuerySchemaType = Static<typeof AuthLoginQuerySchema>;

export const AuthMeResponseSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    email: Type.String(),
    displayName: Type.Union([Type.String(), Type.Null()]),
  },
  { additionalProperties: false },
);
export type AuthMeResponseSchemaType = Static<typeof AuthMeResponseSchema>;

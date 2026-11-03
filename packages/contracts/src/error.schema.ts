import Type, { Static } from "typebox";

// Body of every error the API returns (see the error handler in packages/api/src/app.ts).
export const ErrorResponseSchema = Type.Object(
  {
    error: Type.String({
      description: "Machine-readable error code. Branch on this, not on the message.",
      examples: ["VALIDATION_ERROR"],
    }),
    message: Type.String({
      description: "Human-readable explanation, for logs. Its wording may change.",
    }),
  },
  { additionalProperties: false },
);
export type ErrorResponseSchemaType = Static<typeof ErrorResponseSchema>;

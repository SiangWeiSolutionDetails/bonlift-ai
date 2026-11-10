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

// Errors a /v1 serving route can return; the description becomes the response's text in the OpenAPI document.
export const ServingErrorResponseSchemas = {
  400: {
    ...ErrorResponseSchema,
    description:
      "The request is malformed, e.g. a required field is missing or a value is out of range. Also returned when " +
      "`channel` is sent and is not your API key's channel, or when your key's channel is switched off for the brand.",
  },
  401: {
    ...ErrorResponseSchema,
    description: "The `x-api-key` header is missing, or the key is invalid or revoked.",
  },
  503: {
    ...ErrorResponseSchema,
    description: "The API key cannot be checked right now. Retry later, and continue the order without recommendations.",
  },
};

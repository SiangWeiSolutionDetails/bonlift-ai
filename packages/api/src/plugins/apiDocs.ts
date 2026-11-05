import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import type { FastifyInstance } from "fastify";

const PUBLIC_PREFIX = "/v1/";

// Must be registered before any route: @fastify/swagger collects schemas through the onRoute hook.
export function registerApiDocs(app: FastifyInstance) {
  app.register(swagger, {
    openapi: {
      info: { title: "BonLift AI Serving API", version: "1.0.0" },
      components: {
        securitySchemes: {
          apiKey: { type: "apiKey", in: "header", name: "x-api-key" },
        },
      },
      security: [{ apiKey: [] }],
    },
    // Only the public serving routes are documented; admin routes stay out of the spec.
    transform: ({ schema, url }) => ({
      schema: url.startsWith(PUBLIC_PREFIX) ? schema : { ...schema, hide: true },
      url,
    }),
  });

  app.register(swaggerUi, { routePrefix: "/docs" });
}

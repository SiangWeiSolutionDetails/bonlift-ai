import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import type { FastifyInstance } from "fastify";

const PUBLIC_PREFIX = "/v1/";

// Must be registered before any route: @fastify/swagger collects schemas through the onRoute hook.
export function registerApiDocs(app: FastifyInstance) {
  app.register(swagger, {
    openapi: {
      // Minor bumps: new optional fields and reasons; removing `at` breaks no caller because unknown fields are ignored.
      // 1.2.0 also checks `channel` against the API key's channel (400 on mismatch), which only applies to keys with a channel.
      // 1.3.0 checks customerId: a mobile number with country code and no "+", or an email; anything else is a 400.
      // 1.4.0 adds the optional `detail` per recommended item, with the facts behind its reason.
      // 1.5.0 renames the item affinity reason goes_with_cart to often_ordered_with. Breaking in principle, kept in /v1
      // only because no partner consumed /v1/item-affinity yet. Also documents every reason and detail field.
      // 1.6.0 /v1/recommendations serves one source: the customer's favourites, else the outlet's popular items.
      // goes_with_cart is no longer sent there and affinityRunId is always null; both stay in the schema for /v1.
      // 1.7.0 favourites that go with an item in the cart come first (with `basedOn`); affinityRunId is the item
      // affinity run used for that ordering, null when the brand has none.
      // 1.8.0 adds `recommendationId` to /v1/recommendations and POST /v1/recommendations/{recommendationId}/feedback;
      // items an identified customer rejected recently are no longer recommended to them.
      info: { title: "BonLift AI Serving API", version: "1.8.0" },
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

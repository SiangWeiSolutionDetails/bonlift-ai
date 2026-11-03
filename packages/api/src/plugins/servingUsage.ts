import type { FastifyReply, FastifyRequest } from "fastify";
import { Pool } from "pg";
import { recordServingUsage } from "../services/brandUsage.service.js";

// Runs after the reply is sent, so recording never delays the caller, and a failed write is only logged:
// losing one usage row is better than failing an order (NF-2).
export function createServingUsageHook(getPool: () => Pool) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    // Rejected by the API key hook: no brand to attribute the call to.
    if (!request.servingBrandId || !request.servingApiKeyId) return;

    try {
      await recordServingUsage(getPool(), {
        brandId: request.servingBrandId,
        apiKeyId: request.servingApiKeyId,
        // The route pattern, never the raw URL, so unknown paths can't fill the table with distinct values.
        route: request.routeOptions.url ?? "unmatched",
        statusCode: reply.statusCode,
        durationMs: Math.round(reply.elapsedTime),
      });
    } catch (error) {
      request.log.error({ err: error }, "Serving usage was not recorded");
    }
  };
}

import type { FastifyReply, FastifyRequest } from "fastify";
import { Pool } from "pg";
import { ServedExposure, recordServedExposures } from "../services/recommendation.service.js";

declare module "fastify" {
  interface FastifyRequest {
    servedExposure: ServedExposure | null;
  }
}

// Runs after the reply is sent, like the usage hook: recording never delays the caller, and a failed write is only
// logged (NF-2). The items then only rotate later than they would have.
export function createServedExposureHook(getPool: () => Pool) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const exposure = request.servedExposure;
    // A reply that failed after the handler never reached the caller, so its items were not shown.
    if (!exposure || reply.statusCode >= 400) return;

    try {
      await recordServedExposures(getPool(), exposure);
    } catch (error) {
      request.log.error({ err: error }, "Served items were not recorded as shown");
    }
  };
}

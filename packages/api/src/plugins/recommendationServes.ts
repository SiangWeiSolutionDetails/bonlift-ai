import type { FastifyReply, FastifyRequest } from "fastify";
import { Pool } from "pg";
import { RecommendationServe, recordRecommendationServe } from "../services/recommendation.service.js";

declare module "fastify" {
  interface FastifyRequest {
    recommendationServe: RecommendationServe | null;
  }
}

// Runs after the reply is sent, like the usage hook: recording never delays the caller, and a failed write is only
// logged (NF-2). Feedback on a serve that was not recorded matches nothing and is still accepted.
export function createRecommendationServeHook(getPool: () => Pool) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const serve = request.recommendationServe;
    // A reply that failed after the handler never reached the caller, so its serve is not kept.
    if (!serve || reply.statusCode >= 400) return;

    try {
      await recordRecommendationServe(getPool(), serve, request.servingChannel?.id ?? null);
    } catch (error) {
      request.log.error({ err: error }, "Recommendation serve was not recorded");
    }
  };
}

import Fastify, { type FastifyInstance } from "fastify";
import { AppError } from "./errors.js";
import { healthRoutes } from "./routes/health.route.js";
import { recommendationsRoutes } from "./routes/recommendations.route.js";
import { customerRecommendationsRoutes } from "./routes/customerRecommendations.route.js";

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: true });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      reply
        .status(error.statusCode)
        .send({ error: error.code, message: error.message });
      return;
    }
    app.log.error(error);
    reply
      .status(500)
      .send({ error: "INTERNAL_ERROR", message: "Unexpected error" });
  });

  app.register(healthRoutes);
  app.register(recommendationsRoutes);
  app.register(customerRecommendationsRoutes);

  return app;
}

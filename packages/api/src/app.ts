import Fastify, { FastifyError, type FastifyInstance } from "fastify";
import { AppError } from "./errors.js";
import { healthRoutes } from "./routes/health.route.js";
import { tenantRoutes } from "./routes/tenant.route.js";
import { brandRoutes } from "./routes/brand.route.js";
import { outletRoutes } from "./routes/outlet.route.js";
import { mockDatasetRoutes } from "./routes/mockDataset.route.js";
import { brandDataSourceRoutes } from "./routes/brandDataSource.route.js";
import { datasetRoutes } from "./routes/dataset.route.js";
import { orderSnapshotRoutes } from "./routes/orderSnapshot.route.js";
import { calculationRoutes } from "./routes/calculation.route.js";
import { outletItemScoresCalculationConfigVersionRoutes } from "./routes/outletItemScoresCalculationConfigVersion.route.js";
import { outletItemScoresResultRoutes } from "./routes/outletItemScoresResult.route.js";

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: true,
    ajv: { customOptions: { removeAdditional: false } },
  });

  app.setErrorHandler<FastifyError>((error, _request, reply) => {
    if (error instanceof AppError) {
      reply
        .status(error.statusCode)
        .send({ error: error.code, message: error.message });
      return;
    }

    if (error.validation) {
      reply
        .status(400)
        .send({ error: "VALIDATION_ERROR", message: error.message });
      return;
    }

    app.log.error(error);

    reply
      .status(500)
      .send({ error: "INTERNAL_ERROR", message: "Unexpected error" });
  });

  app.register(healthRoutes);
  app.register(tenantRoutes);
  app.register(brandRoutes);
  app.register(outletRoutes);
  app.register(brandDataSourceRoutes);
  app.register(datasetRoutes);
  app.register(orderSnapshotRoutes);
  app.register(calculationRoutes);
  app.register(outletItemScoresCalculationConfigVersionRoutes);
  app.register(outletItemScoresResultRoutes);

  if (process.env.NODE_ENV !== "production") {
    app.register(mockDatasetRoutes);
  }

  return app;
}

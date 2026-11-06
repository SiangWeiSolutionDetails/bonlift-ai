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
import { customerItemScoresCalculationConfigVersionRoutes } from "./routes/customerItemScoresCalculationConfigVersion.route.js";
import { customerItemScoresResultRoutes } from "./routes/customerItemScoresResult.route.js";
import { itemAffinityCalculationConfigVersionRoutes } from "./routes/itemAffinityCalculationConfigVersion.route.js";
import { itemAffinityResultRoutes } from "./routes/itemAffinityResult.route.js";
import { recommendationRoutes } from "./routes/recommendation.route.js";
import { itemAffinityServingRoutes } from "./routes/itemAffinityServing.route.js";
import { brandApiKeyRoutes } from "./routes/brandApiKey.route.js";
import { brandUsageRoutes } from "./routes/brandUsage.route.js";
import { getPool } from "@bonlift-ai/db";
import {
  createServingAuthHook,
  createServingKeyAuthenticator,
} from "./plugins/servingAuth.js";
import { createServingUsageHook } from "./plugins/servingUsage.js";
import { registerApiDocs } from "./plugins/apiDocs.js";
import { createAdminAuthHook } from "./plugins/adminAuth.js";
import { areDevRoutesEnabled, readAdminToken } from "./config/env.js";

export function buildApp(): FastifyInstance {
  const adminToken = readAdminToken();
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

  registerApiDocs(app);

  app.register(healthRoutes);

  // Admin surface: the admin token hook is encapsulated to this scope only.
  app.register(async (admin) => {
    admin.addHook("onRequest", createAdminAuthHook(adminToken));
    admin.register(tenantRoutes);
    admin.register(brandRoutes);
    admin.register(outletRoutes);
    admin.register(brandDataSourceRoutes);
    admin.register(datasetRoutes);
    admin.register(orderSnapshotRoutes);
    admin.register(calculationRoutes);
    admin.register(outletItemScoresCalculationConfigVersionRoutes);
    admin.register(outletItemScoresResultRoutes);
    admin.register(customerItemScoresCalculationConfigVersionRoutes);
    admin.register(customerItemScoresResultRoutes);
    admin.register(itemAffinityCalculationConfigVersionRoutes);
    admin.register(itemAffinityResultRoutes);
    admin.register(brandUsageRoutes);
    admin.register(brandApiKeyRoutes);

    if (areDevRoutesEnabled()) {
      admin.register(mockDatasetRoutes);
    }
  });

  // Serving routes for TQR, POS and kiosk: versioned, and the brand API key hook is encapsulated to this prefix only.
  app.register(
    async (serving) => {
      serving.decorateRequest("servingBrandId", null);
      serving.decorateRequest("servingApiKeyId", null);
      serving.addHook(
        "onRequest",
        createServingAuthHook(createServingKeyAuthenticator({ getPool })),
      );
      serving.addHook("onResponse", createServingUsageHook(getPool));
      serving.register(recommendationRoutes);
      serving.register(itemAffinityServingRoutes);
    },
    { prefix: "/v1" },
  );

  return app;
}

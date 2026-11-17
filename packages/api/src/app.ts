import fastifyCookie from "@fastify/cookie";
import Fastify, { FastifyError, type FastifyInstance, type FastifyRequest } from "fastify";
import { AppError } from "./errors.js";
import { healthRoutes } from "./routes/health.route.js";
import { tenantRoutes } from "./routes/tenant.route.js";
import { brandRoutes } from "./routes/brand.route.js";
import { outletRoutes } from "./routes/outlet.route.js";
import { mockDatasetRoutes } from "./routes/mockDataset.route.js";
import { brandDataSourceRoutes } from "./routes/brandDataSource.route.js";
import { brandCalculationScheduleRoutes } from "./routes/brandCalculationSchedule.route.js";
import { datasetRoutes } from "./routes/dataset.route.js";
import { orderSnapshotRoutes } from "./routes/orderSnapshot.route.js";
import { calculationRoutes } from "./routes/calculation.route.js";
import { calculationsOverviewRoutes } from "./routes/calculationsOverview.route.js";
import { outletItemScoresCalculationConfigVersionRoutes } from "./routes/outletItemScoresCalculationConfigVersion.route.js";
import { outletItemScoresResultRoutes } from "./routes/outletItemScoresResult.route.js";
import { customerItemScoresCalculationConfigVersionRoutes } from "./routes/customerItemScoresCalculationConfigVersion.route.js";
import { customerItemScoresResultRoutes } from "./routes/customerItemScoresResult.route.js";
import { itemAffinityCalculationConfigVersionRoutes } from "./routes/itemAffinityCalculationConfigVersion.route.js";
import { servingConfigVersionRoutes } from "./routes/servingConfigVersion.route.js";
import { itemAffinityResultRoutes } from "./routes/itemAffinityResult.route.js";
import { recommendationRoutes } from "./routes/recommendation.route.js";
import { itemAffinityServingRoutes } from "./routes/itemAffinityServing.route.js";
import { brandApiKeyRoutes } from "./routes/brandApiKey.route.js";
import { authRoutes } from "./routes/auth.route.js";
import { brandChannelRoutes } from "./routes/brandChannel.route.js";
import { brandUsageRoutes } from "./routes/brandUsage.route.js";
import { recommendationFeedbackReportRoutes } from "./routes/recommendationFeedbackReport.route.js";
import { roleRoutes } from "./routes/role.route.js";
import { userRoutes } from "./routes/user.route.js";
import { getPool } from "@bonlift-ai/db";
import {
  createServingAuthHook,
  createServingChannelHook,
  createServingKeyAuthenticator,
} from "./plugins/servingAuth.js";
import { createServingUsageHook } from "./plugins/servingUsage.js";
import { registerApiDocs } from "./plugins/apiDocs.js";
import { registerAdminAccess } from "./plugins/adminAccess.js";
import { areDevRoutesEnabled, readAuthConfig, readCustomerIdSecret } from "./config/env.js";

const CALLBACK_PATH_PREFIX = "/auth/callback/";

// The sign-in callback URL carries the authorization code and state: never log its query string.
function redactLoggedUrl(url: string): string {
  return url.startsWith(CALLBACK_PATH_PREFIX) ? url.split("?")[0] : url;
}

function serializeRequest(request: FastifyRequest) {
  return {
    method: request.method,
    url: redactLoggedUrl(request.url),
    host: request.host,
    remoteAddress: request.ip,
    remotePort: request.socket?.remotePort,
  };
}

export function buildApp(): FastifyInstance {
  // Read at start so a missing secret stops the API instead of failing the first upload or /v1 call.
  readCustomerIdSecret();
  const authConfig = readAuthConfig();
  const app = Fastify({
    logger: { serializers: { req: serializeRequest } },
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

  app.register(fastifyCookie, { secret: authConfig.cookieSecret });
  app.register(healthRoutes);
  app.register(authRoutes);

  // Admin surface: the access hooks are encapsulated to this scope only.
  app.register(async (admin) => {
    registerAdminAccess(admin, getPool);
    admin.register(tenantRoutes);
    admin.register(brandRoutes);
    admin.register(outletRoutes);
    admin.register(brandDataSourceRoutes);
    admin.register(brandCalculationScheduleRoutes);
    admin.register(datasetRoutes);
    admin.register(orderSnapshotRoutes);
    admin.register(calculationRoutes);
    admin.register(calculationsOverviewRoutes);
    admin.register(outletItemScoresCalculationConfigVersionRoutes);
    admin.register(outletItemScoresResultRoutes);
    admin.register(customerItemScoresCalculationConfigVersionRoutes);
    admin.register(customerItemScoresResultRoutes);
    admin.register(itemAffinityCalculationConfigVersionRoutes);
    admin.register(itemAffinityResultRoutes);
    admin.register(servingConfigVersionRoutes);
    admin.register(brandUsageRoutes);
    admin.register(recommendationFeedbackReportRoutes);
    admin.register(brandChannelRoutes);
    admin.register(brandApiKeyRoutes);
    admin.register(roleRoutes);
    admin.register(userRoutes);

    if (areDevRoutesEnabled()) {
      admin.register(mockDatasetRoutes);
    }
  });

  // Serving routes for TQR, POS and kiosk: versioned, and the brand API key hook is encapsulated to this prefix only.
  app.register(
    async (serving) => {
      serving.decorateRequest("servingBrandId", null);
      serving.decorateRequest("servingApiKeyId", null);
      serving.decorateRequest("servingChannel", null);
      serving.addHook(
        "onRequest",
        createServingAuthHook(createServingKeyAuthenticator({ getPool })),
      );
      serving.addHook("preHandler", createServingChannelHook());
      serving.addHook("onResponse", createServingUsageHook(getPool));
      serving.register(recommendationRoutes);
      serving.register(itemAffinityServingRoutes);
    },
    { prefix: "/v1" },
  );

  return app;
}

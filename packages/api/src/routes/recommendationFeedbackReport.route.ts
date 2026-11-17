import {
  BrandParamsSchema,
  BrandParamsSchemaType,
  RecommendationFeedbackReportQuerySchema,
  RecommendationFeedbackReportQuerySchemaType,
  RecommendationFeedbackReportSchema,
  RecommendationServesQuerySchema,
  RecommendationServesQuerySchemaType,
  RecommendationServesSchema,
} from "@bonlift-ai/contracts";
import { getPool } from "@bonlift-ai/db";
import { FastifyInstance } from "fastify";
import {
  getRecommendationFeedbackReport,
  listRecommendationServes,
} from "../services/recommendationFeedbackReport.service.js";

// Requires a signed-in session like every admin route, but has no per-brand permission check yet.
export async function recommendationFeedbackReportRoutes(app: FastifyInstance) {
  app.get<{ Params: BrandParamsSchemaType; Querystring: RecommendationFeedbackReportQuerySchemaType }>(
    "/brands/:brandId/recommendation-feedback",
    {
      schema: {
        params: BrandParamsSchema,
        querystring: RecommendationFeedbackReportQuerySchema,
        response: { 200: RecommendationFeedbackReportSchema },
      },
    },
    (request) => {
      const pool = getPool();
      return getRecommendationFeedbackReport(pool, request.params.brandId, request.query);
    },
  );

  app.get<{ Params: BrandParamsSchemaType; Querystring: RecommendationServesQuerySchemaType }>(
    "/brands/:brandId/recommendation-serves",
    {
      schema: {
        params: BrandParamsSchema,
        querystring: RecommendationServesQuerySchema,
        response: { 200: RecommendationServesSchema },
      },
    },
    (request) => {
      const pool = getPool();
      return listRecommendationServes(pool, request.params.brandId, request.query);
    },
  );
}

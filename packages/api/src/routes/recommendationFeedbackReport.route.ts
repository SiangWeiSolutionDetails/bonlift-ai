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

export async function recommendationFeedbackReportRoutes(app: FastifyInstance) {
  app.get<{ Params: BrandParamsSchemaType; Querystring: RecommendationFeedbackReportQuerySchemaType }>(
    "/brands/:brandId/recommendation-feedback",
    {
      config: { access: { brand: "feedback.view", from: "params.brandId" } },
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
      config: { access: { brand: "feedback.view", from: "params.brandId" } },
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

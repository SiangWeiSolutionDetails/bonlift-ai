import type {
  RecommendationFeedbackReportQuerySchemaType,
  RecommendationServesQuerySchemaType,
} from "@bonlift-ai/contracts";
import { apiRequest } from "@/lib/api-client";
import type { FeedbackReport, ServesPage } from "./type";

function brandPath(brandId: string) {
  return `/brands/${encodeURIComponent(brandId)}`;
}

export async function getRecommendationFeedbackReport(
  brandId: string,
  query: RecommendationFeedbackReportQuerySchemaType,
  signal: AbortSignal,
) {
  return apiRequest<FeedbackReport>(`${brandPath(brandId)}/recommendation-feedback`, {
    query,
    signal,
  });
}

export async function listRecommendationServes(
  brandId: string,
  query: RecommendationServesQuerySchemaType,
  signal: AbortSignal,
) {
  return apiRequest<ServesPage>(`${brandPath(brandId)}/recommendation-serves`, {
    query,
    signal,
  });
}

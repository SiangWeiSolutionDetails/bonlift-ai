import { skipToken, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { brandKeys } from "../brands/queries";
import { VIEWER_TIME_ZONE } from "../brand-usage/queries";
import { getRecommendationFeedbackReport, listRecommendationServes } from "./api";
import type { FeedbackFilters } from "./type";

const SERVES_PAGE_SIZE = 50;

export const recommendationFeedbackKeys = {
  report: (brandId: string, filters: FeedbackFilters, tz: string) =>
    [...brandKeys.detail(brandId), "recommendation-feedback", { ...filters, tz }] as const,
  serves: (brandId: string, filters: FeedbackFilters, tz: string) =>
    [...brandKeys.detail(brandId), "recommendation-serves", { ...filters, tz }] as const,
};

// enabled false: the page asks only for ranges the API accepts, so a too-long range makes no request.
export function useRecommendationFeedbackReport(
  brandId: string,
  filters: FeedbackFilters,
  enabled = true,
) {
  return useQuery({
    queryKey: recommendationFeedbackKeys.report(brandId, filters, VIEWER_TIME_ZONE),
    queryFn: enabled
      ? ({ signal }) =>
          getRecommendationFeedbackReport(brandId, { ...filters, tz: VIEWER_TIME_ZONE }, signal)
      : skipToken,
  });
}

export function useRecommendationServes(brandId: string, filters: FeedbackFilters) {
  return useInfiniteQuery({
    queryKey: recommendationFeedbackKeys.serves(brandId, filters, VIEWER_TIME_ZONE),
    queryFn: ({ pageParam, signal }) =>
      listRecommendationServes(
        brandId,
        { ...filters, tz: VIEWER_TIME_ZONE, limit: SERVES_PAGE_SIZE, before: pageParam },
        signal,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

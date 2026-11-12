import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import { getErrorMessage } from "@/lib/error-message";
import { useRecommendationFeedbackReport } from "../queries";
import type { FeedbackFilters } from "../type";
import { FeedbackBreakdownTable } from "./feedback-breakdown-table";
import { FeedbackOutcomesChart } from "./feedback-outcomes-chart";
import { FeedbackRateChart } from "./feedback-rate-chart";
import { FeedbackSummary } from "./feedback-summary";
import { RecommendationServesLog } from "./recommendation-serves-log";

type RecommendationFeedbackReportProps = {
  brandId: string;
  filters: FeedbackFilters;
};

export function RecommendationFeedbackReport({ brandId, filters }: RecommendationFeedbackReportProps) {
  const { t } = useTranslation("recommendationFeedback");
  const { t: tCommon } = useTranslation();
  const { data: report, error, isPending } = useRecommendationFeedbackReport(brandId, filters);

  if (isPending) {
    return <Skeleton className="h-96 w-full rounded-xl" />;
  }

  if (error) {
    return <p className="text-sm text-destructive">{getErrorMessage(error, tCommon)}</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">{t("page.description", { tz: report.tz })}</p>

      <FeedbackSummary summary={report.summary} />

      <div className="grid gap-6 rounded-xl bg-card p-5 shadow-panel">
        <div className="grid gap-3">
          <h3 className="text-sm font-medium">{t("charts.outcomes")}</h3>
          <FeedbackOutcomesChart days={report.days} />
        </div>
        <div className="grid gap-3">
          <h3 className="text-sm font-medium">{t("charts.acceptanceRate")}</h3>
          <FeedbackRateChart days={report.days} />
        </div>
      </div>

      <FeedbackBreakdownTable report={report} />

      <RecommendationServesLog brandId={brandId} filters={filters} />
    </div>
  );
}

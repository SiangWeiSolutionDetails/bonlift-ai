import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import { getErrorMessage } from "@/lib/error-message";
import { deriveInsights } from "../overview";
import { joinCalculations } from "../registry";
import type { CalculationsOverview, StartAllResponse } from "../type";
import { CalculationCard } from "./calculation-card";
import { InsightsPanel } from "./insights-panel";
import { RunProgress } from "./run-progress";
import { TopItemsTable } from "./top-items-table";
import { TopPairsTable } from "./top-pairs-table";

type CalculationsOverviewReportProps = {
  overview: CalculationsOverview | undefined;
  error: Error | null;
  isPending: boolean;
  startResponse: StartAllResponse | undefined;
};

export function CalculationsOverviewReport({
  overview,
  error,
  isPending,
  startResponse,
}: CalculationsOverviewReportProps) {
  const { t: tCommon } = useTranslation();

  if (isPending) {
    return <OverviewSkeleton />;
  }

  if (error || !overview) {
    return <p className="text-sm text-destructive">{getErrorMessage(error, tCommon)}</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      {startResponse && <RunProgress overview={overview} response={startResponse} />}

      <InsightsPanel insights={deriveInsights(overview)} />

      <div className="grid gap-6 xl:grid-cols-2">
        {joinCalculations(overview.calculations).map((calculation) => (
          <CalculationCard
            key={calculation.entry.jobType}
            {...calculation}
            brandId={overview.brandId}
          />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <TopPairsTable pairs={overview.topPairs} />
        <TopItemsTable items={overview.topItems} />
      </div>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-20 w-full rounded-xl" />
      <div className="grid gap-6 xl:grid-cols-2">
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    </div>
  );
}

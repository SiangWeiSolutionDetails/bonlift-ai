import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import { getErrorMessage } from "@/lib/error-message";
import { summarizeOverview } from "../overview";
import { joinCalculations } from "../registry";
import type { CalculationJobType, CalculationsOverview } from "../type";
import { CalculationCard } from "./calculation-card";
import { OverviewTotalsStrip } from "./overview-totals";
import { TopItemsTable } from "./top-items-table";
import { TopPairsTable } from "./top-pairs-table";

type CalculationsOverviewReportProps = {
  overview: CalculationsOverview | undefined;
  error: Error | null;
  isPending: boolean;
};

export function CalculationsOverviewReport({
  overview,
  error,
  isPending,
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
      <OverviewTotalsStrip totals={summarizeOverview(overview)} />

      <div className="grid gap-4">
        {joinCalculations(overview.calculations).map((calculation) => (
          <CalculationCard
            key={calculation.entry.jobType}
            {...calculation}
            brandId={overview.brandId}
            windowTo={overview.windowTo}
            results={resultsFor(calculation.entry.jobType, overview)}
          />
        ))}
      </div>
    </div>
  );
}

// Top lists live under the calculation whose published results they come from
function resultsFor(jobType: CalculationJobType, overview: CalculationsOverview) {
  switch (jobType) {
    case "outlet_item_scores":
      return <TopItemsTable items={overview.topItems} />;
    case "item_affinity":
      return <TopPairsTable pairs={overview.topPairs} />;
    default:
      return null;
  }
}

function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-28 w-full rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-28 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

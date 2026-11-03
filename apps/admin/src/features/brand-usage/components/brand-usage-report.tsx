import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import { getErrorMessage } from "@/lib/error-message";
import { fillUsageDays, sumUsageDays } from "../days";
import { useBrandUsage } from "../queries";
import { UsageCallsChart } from "./usage-calls-chart";
import { UsageDaysTable } from "./usage-days-table";
import { UsageRunsChart } from "./usage-runs-chart";
import { UsageSummary } from "./usage-summary";

type BrandUsageReportProps = {
  brandId: string;
  from: string;
  to: string;
};

export function BrandUsageReport({ brandId, from, to }: BrandUsageReportProps) {
  const { t } = useTranslation("usage");
  const { t: tCommon } = useTranslation();
  const { data: usage, error, isPending } = useBrandUsage(brandId, from, to);

  if (isPending) {
    return <Skeleton className="h-96 w-full rounded-xl" />;
  }

  if (error) {
    return <p className="text-sm text-destructive">{getErrorMessage(error, tCommon)}</p>;
  }

  const chartDays = fillUsageDays(usage.days, usage.from, usage.to);

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">{t("days.description", { tz: usage.tz })}</p>

      <UsageSummary totals={sumUsageDays(usage.days)} />

      <div className="grid gap-6 rounded-xl bg-card p-5 shadow-panel">
        <div className="grid gap-3">
          <h3 className="text-sm font-medium">{t("charts.calls")}</h3>
          <UsageCallsChart days={chartDays} />
        </div>
        <div className="grid gap-3">
          <h3 className="text-sm font-medium">{t("counts.calculationRuns")}</h3>
          <UsageRunsChart days={chartDays} />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl bg-card shadow-panel">
        <UsageDaysTable days={usage.days} />
      </div>
    </div>
  );
}

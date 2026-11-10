import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import { getErrorMessage } from "@/lib/error-message";
import { fillUsageDays, sumUsageDays } from "../days";
import { useBrandUsage } from "../queries";
import type { BrandUsage } from "../type";
import { UsageBreakdownTable, type UsageBreakdownRow } from "./usage-breakdown-table";
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

      <div className="grid gap-6 lg:grid-cols-2">
        <UsageBreakdownTable title={t("breakdown.byChannel")} rows={toChannelRows(usage, t)} />
        <UsageBreakdownTable title={t("breakdown.byKey")} rows={toKeyRows(usage, t)} />
      </div>

      <div className="overflow-hidden rounded-xl bg-card shadow-panel">
        <UsageDaysTable days={usage.days} />
      </div>
    </div>
  );
}

type Translate = (key: "breakdown.unassigned" | "breakdown.deletedKey") => string;

// A null channel is calls of keys created before channels existed.
function toChannelRows(usage: BrandUsage, t: Translate): UsageBreakdownRow[] {
  return usage.channels.map((channel) => ({
    ...channel,
    id: channel.channelId ?? "unassigned",
    label: channel.channelId ? (
      <span>
        {channel.name} <span className="font-mono text-muted-foreground">{channel.code}</span>
      </span>
    ) : (
      <span className="text-muted-foreground">{t("breakdown.unassigned")}</span>
    ),
  }));
}

// A null key is calls of a key that has since been deleted.
function toKeyRows(usage: BrandUsage, t: Translate): UsageBreakdownRow[] {
  return usage.apiKeys.map((apiKey) => ({
    ...apiKey,
    id: apiKey.apiKeyId ?? "deleted",
    label: apiKey.apiKeyId ? (
      <span>
        {apiKey.name} <span className="font-mono text-muted-foreground">{apiKey.keyPrefix}</span>
      </span>
    ) : (
      <span className="text-muted-foreground">{t("breakdown.deletedKey")}</span>
    ),
  }));
}

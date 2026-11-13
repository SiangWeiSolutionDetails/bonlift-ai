import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRightIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDuration, formatWindow } from "@/features/outlet-item-scores/format";
import { formatDateTime } from "@/lib/date-format";
import { countOutletStatuses, latestFinishedRun } from "../overview";
import type { RegisteredCalculation } from "../registry";
import type { CalculationEntry } from "../type";
import { CalculationStatusBadge } from "./calculation-status-badge";
import { OutletRunsTable } from "./outlet-runs-table";

type CalculationCardProps = RegisteredCalculation & { brandId: string };

export function CalculationCard({ definition, entry, brandId }: CalculationCardProps) {
  const { t } = useTranslation("calculations");
  const finishedRun = latestFinishedRun(entry);
  const duration = finishedRun ? formatDuration(finishedRun.startedAt, finishedRun.finishedAt) : null;

  return (
    <section className="grid min-w-0 content-start gap-5 rounded-xl bg-card p-5 shadow-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <h3 className="font-heading text-base font-semibold">{t(definition.titleKey)}</h3>
          <p className="text-sm text-muted-foreground">{t(definition.descriptionKey)}</p>
        </div>
        {entry.scope === "brand" ? (
          <CalculationStatusBadge run={entry.latestRun} />
        ) : (
          <OutletStatusSummary entry={entry} />
        )}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
        <Detail label={t("card.scheduleWindow")}>
          {t("card.scheduleWindowValue", { count: entry.windowDays })}
        </Detail>
        {entry.scope === "brand" ? (
          <Detail label={t("card.publishedWindow")}>
            {entry.publishedRun
              ? formatWindow(entry.publishedRun.from, entry.publishedRun.to)
              : t("card.nothingPublished")}
          </Detail>
        ) : (
          <Detail label={t("card.publishedOutlets")}>
            {t("card.publishedOutletsValue", {
              published: countOutletStatuses(entry.outlets).published,
              total: entry.outlets.length,
            })}
          </Detail>
        )}
        <Detail label={t("card.resultsAge")}>
          <ResultsAge days={entry.resultsAgeDays} />
        </Detail>
        <Detail label={t("card.lastFinished")}>
          {finishedRun?.finishedAt ? formatDateTime(finishedRun.finishedAt) : t("card.noRuns")}
        </Detail>
        <Detail label={t("card.duration")}>{duration ?? "—"}</Detail>
        <Detail label={t(definition.metricsLabelKey.subjects)}>
          {entry.metrics.subjects.toLocaleString()}
        </Detail>
        <Detail label={t(definition.metricsLabelKey.rows)}>
          {entry.metrics.rows.toLocaleString()}
        </Detail>
      </dl>

      {entry.scope === "outlet" && <OutletRunsTable brandId={brandId} outlets={entry.outlets} />}

      <div>
        <Button asChild variant="outline" size="sm">
          <Link {...definition.details(brandId)}>
            {t("card.viewDetails")}
            <ArrowRightIcon data-icon="inline-end" />
          </Link>
        </Button>
      </div>
    </section>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium break-words tabular-nums">{children}</dd>
    </div>
  );
}

function ResultsAge({ days }: { days: number | null }) {
  const { t } = useTranslation("calculations");
  if (days === null) return <span className="text-muted-foreground">{t("card.nothingPublished")}</span>;
  if (days <= 0) return <span>{t("card.upToDate")}</span>;
  return (
    <span className={days > 1 ? "text-amber-600 dark:text-amber-400" : undefined}>
      {t("card.resultsAgeValue", { count: days })}
    </span>
  );
}

const SUMMARY_STATUSES = [
  ["running", "secondary"],
  ["succeeded", "success"],
  ["failed", "destructive"],
  ["neverRun", "outline"],
] as const;

function OutletStatusSummary({ entry }: { entry: CalculationEntry }) {
  const { t } = useTranslation("calculations");
  const counts = countOutletStatuses(entry.outlets);

  return (
    <div className="flex flex-wrap gap-1.5">
      {SUMMARY_STATUSES.filter(([status]) => counts[status] > 0).map(([status, variant]) => (
        <Badge key={status} variant={variant}>
          {t(`status.${status}`)} · {counts[status]}
        </Badge>
      ))}
    </div>
  );
}

import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRightIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { formatDuration, formatWindow } from "@/features/outlet-item-scores/format";
import { formatDateTime } from "@/lib/date-format";
import { countOutletStatuses, latestFinishedRun } from "../overview";
import type { RegisteredCalculation } from "../registry";
import type { CalculationEntry } from "../type";
import { scheduleWindow } from "../windows";
import { CalculationStatusBadge, StatusBadge } from "./calculation-status-badge";
import { CollapsibleSection } from "./collapsible-section";
import { OutletRunsTable } from "./outlet-runs-table";
import { PublishedRun, RunIdLink } from "./published-run";

type CalculationCardProps = RegisteredCalculation & {
  brandId: string;
  windowTo: string;
  results?: ReactNode;
};

function formatScheduleWindow(windowDays: number, windowTo: string) {
  const { from, to } = scheduleWindow(windowDays, windowTo);
  return formatWindow(from, to);
}

export function CalculationCard({ definition, entry, brandId, windowTo, results }: CalculationCardProps) {
  const { t } = useTranslation("calculations");
  const finishedRun = latestFinishedRun(entry);
  const duration = finishedRun ? formatDuration(finishedRun.startedAt, finishedRun.finishedAt) : null;

  const summary = (
    <div className="grid gap-3">
      {entry.scope === "brand" ? (
        <CalculationStatusBadge run={entry.latestRun} />
      ) : (
        <OutletStatusSummary entry={entry} />
      )}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
        <Detail label={t("card.resultsAge")}>
          <ResultsAge days={entry.resultsAgeDays} />
        </Detail>
        <Detail label={t("card.lastFinished")}>
          {finishedRun?.finishedAt ? formatDateTime(finishedRun.finishedAt) : t("card.noRuns")}
        </Detail>
        <Detail label={t(definition.metricsLabelKey.subjects)}>
          {entry.metrics.subjects.toLocaleString()}
        </Detail>
      </dl>
    </div>
  );

  return (
    <CollapsibleSection
      title={t(definition.titleKey)}
      summary={summary}
      action={
        entry.publishedRun && (
          <div className="grid justify-items-end gap-0.5 text-right">
            <span className="text-xs text-muted-foreground">{t("card.publishedRun")}</span>
            <RunIdLink
              runId={entry.publishedRun.id}
              target={definition.details(brandId, { runId: entry.publishedRun.id })}
            />
          </div>
        )
      }
    >

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
        <Detail label={t("card.scheduleWindow")}>
          {formatScheduleWindow(entry.windowDays, windowTo)}
        </Detail>
        {entry.scope === "brand" ? (
          <Detail label={t("card.publishedWindow")}>
            {entry.publishedRun ? (
              <PublishedRun
                run={entry.publishedRun}
                target={definition.details(brandId, { runId: entry.publishedRun.id })}
              />
            ) : (
              t("card.nothingPublished")
            )}
          </Detail>
        ) : (
          <Detail label={t("card.publishedOutlets")}>
            {t("card.publishedOutletsValue", {
              published: countOutletStatuses(entry.outlets).published,
              total: entry.outlets.length,
            })}
          </Detail>
        )}
        <Detail label={t("card.duration")}>{duration ?? "—"}</Detail>
        <Detail label={t(definition.metricsLabelKey.rows)}>
          {entry.metrics.rows.toLocaleString()}
        </Detail>
      </dl>

      {entry.scope === "outlet" && <OutletRunsTable brandId={brandId} outlets={entry.outlets} />}

      {results}

      <div className="flex justify-end">
        <Button asChild variant="ghost" size="sm">
          <Link {...definition.details(brandId)}>
            {t("card.viewDetails")}
            <ArrowRightIcon data-icon="inline-end" />
          </Link>
        </Button>
      </div>
    </CollapsibleSection>
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

const SUMMARY_STATUSES = ["running", "succeeded", "failed", "neverRun"] as const;

function OutletStatusSummary({ entry }: { entry: CalculationEntry }) {
  const { t } = useTranslation("calculations");
  const counts = countOutletStatuses(entry.outlets);

  return (
    <div className="flex flex-wrap gap-1.5">
      {SUMMARY_STATUSES.filter((status) => counts[status] > 0).map((status) => (
        <StatusBadge key={status} status={status}>
          {t(`status.${status}`)} · {counts[status]}
        </StatusBadge>
      ))}
    </div>
  );
}

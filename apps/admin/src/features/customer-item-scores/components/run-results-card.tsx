import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { SectionCard } from "@/components/section-card";
import { CopyableId } from "@/features/outlet-item-scores/components/copyable-id";
import {
  formatDuration,
  formatWindow,
} from "@/features/outlet-item-scores/format";
import { formatDateTime } from "@/lib/date-format";
import { cn } from "@/lib/utils";
import type { CustomerItemScoresRun } from "../type";
import { CustomerList } from "./customer-list";
import { CustomerRanking } from "./customer-ranking";
import { RunConfigBadge, RunStatusBadge } from "./run-badges";

type RunResultsCardProps = {
  run: CustomerItemScoresRun;
  customerId: string | undefined;
  onSelectCustomer: (customerId: string) => void;
};

export function RunResultsCard({
  run,
  customerId,
  onSelectCustomer,
}: RunResultsCardProps) {
  return (
    <SectionCard>
      <RunDetails run={run} />
      <RunResultsBody
        run={run}
        customerId={customerId}
        onSelectCustomer={onSelectCustomer}
      />
    </SectionCard>
  );
}

function RunDetails({ run }: { run: CustomerItemScoresRun }) {
  const { t } = useTranslation("customerScores");

  return (
    <dl className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
      <Detail label={t("runs.runId")}>
        <CopyableId id={run.id} />
      </Detail>
      <Detail label={t("runs.window")}>{formatWindow(run.from, run.to)}</Detail>
      <Detail label={t("runs.config")}>
        <RunConfigBadge run={run} />
      </Detail>
      <Detail label={t("runs.status")}>
        <RunStatusBadge run={run} />
      </Detail>
      <Detail label={t("runs.rows")}>
        <span className="tabular-nums">{run.rowCount ?? "—"}</span>
      </Detail>
      <Detail label={t("runs.duration")}>
        <span className="tabular-nums">
          {formatDuration(run.startedAt, run.finishedAt) ?? "—"}
        </span>
      </Detail>
      <Detail label={t("runs.started")}>{formatDateTime(run.startedAt)}</Detail>
    </dl>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid content-start gap-1.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function RunResultsBody({
  run,
  customerId,
  onSelectCustomer,
}: RunResultsCardProps) {
  const { t } = useTranslation("customerScores");

  if (run.status === "running") {
    return <Message>{t("ranking.running")}</Message>;
  }
  if (run.status === "failed") {
    return (
      <Message className="text-destructive">
        {t("ranking.failed", { error: run.error ?? "" })}
      </Message>
    );
  }
  if (!run.rowCount) {
    return <Message>{t("ranking.empty")}</Message>;
  }

  return (
    // Fixed height side by side, so the list and the ranking line up and each scrolls inside
    <div className="grid gap-4 xl:h-[32rem] xl:grid-cols-[18rem_minmax(0,1fr)]">
      <CustomerList
        runId={run.id}
        selectedCustomerId={customerId}
        onSelect={onSelectCustomer}
      />
      {customerId ? (
        // key drops the previous customer's table instead of showing it under the new selection
        <CustomerRanking key={customerId} runId={run.id} customerId={customerId} />
      ) : (
        <Message>{t("ranking.noCustomer")}</Message>
      )}
    </div>
  );
}

function Message({ children, className }: { children: string; className?: string }) {
  return (
    <p className={cn("py-10 text-center text-sm text-muted-foreground", className)}>
      {children}
    </p>
  );
}

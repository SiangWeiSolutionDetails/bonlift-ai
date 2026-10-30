import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { SectionCard } from "@/components/section-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatTime } from "@/lib/date-format";
import { getErrorMessage } from "@/lib/error-message";
import { cn } from "@/lib/utils";
import { addDays, formatDuration } from "../format";
import type { OutletItemScoresRun } from "../type";
import { CopyableId } from "./copyable-id";
import { RunConfigBadge, RunStatusBadge } from "./run-badges";

const COLUMN_COUNT = 8;
const SKELETON_ROW_COUNT = 3;

type RunsCardProps = {
  runs: OutletItemScoresRun[] | undefined;
  isPending: boolean;
  error: Error | null;
  viewingRunId: string | undefined;
  onView: (runId: string) => void;
};

export function RunsCard(props: RunsCardProps) {
  const { t } = useTranslation("results");

  return (
    <SectionCard title={t("runs.title")}>
      <div className="-mx-5 -mb-5 overflow-x-auto border-t">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-5">{t("runs.runId")}</TableHead>
              <TableHead>{t("runs.window")}</TableHead>
              <TableHead>{t("runs.config")}</TableHead>
              <TableHead>{t("runs.status")}</TableHead>
              <TableHead className="text-right">{t("runs.rows")}</TableHead>
              <TableHead className="text-right">{t("runs.duration")}</TableHead>
              <TableHead>{t("runs.started")}</TableHead>
              <TableHead className="pr-5 text-right">
                <span className="sr-only">{t("runs.actions")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <RunRows {...props} />
          </TableBody>
        </Table>
      </div>
    </SectionCard>
  );
}

function RunRows({
  runs,
  isPending,
  error,
  viewingRunId,
  onView,
}: RunsCardProps) {
  const { t } = useTranslation("results");
  const { t: tCommon } = useTranslation();

  if (isPending) {
    return Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
      <TableRow key={index}>
        <TableCell colSpan={COLUMN_COUNT} className="px-5">
          <Skeleton className="h-5 w-full" />
        </TableCell>
      </TableRow>
    ));
  }

  if (error) {
    return (
      <MessageRow className="text-destructive">
        {getErrorMessage(error, tCommon)}
      </MessageRow>
    );
  }

  if (!runs?.length) {
    return <MessageRow>{t("runs.empty")}</MessageRow>;
  }

  return runs.map((run) => {
    const isViewing = run.id === viewingRunId;

    return (
      <TableRow key={run.id} className={cn(isViewing && "bg-primary/5")}>
        <TableCell className="pl-5">
          {/* Icon pinned to the cell's right edge so the copy icons line up down the column */}
          <div className="grid justify-items-start gap-1">
            <CopyableId id={run.id} className="flex w-full justify-between" />
            {run.isPublished && <Badge>{t("runs.published")}</Badge>}
          </div>
        </TableCell>
        <TableCell>
          {/* Stacked like Started, so the full run ID fits without a sideways scroll */}
          <div className="grid font-medium">
            <span>{formatDate(run.from)}</span>
            <span>{formatDate(addDays(run.to, -1))}</span>
          </div>
        </TableCell>
        <TableCell>
          <RunConfigBadge run={run} />
        </TableCell>
        <TableCell>
          <RunStatusBadge run={run} />
        </TableCell>
        <TableCell className="text-right tabular-nums">
          {run.rowCount ?? "—"}
        </TableCell>
        <TableCell className="text-right tabular-nums text-muted-foreground">
          {formatDuration(run.startedAt, run.finishedAt) ?? "—"}
        </TableCell>
        <TableCell>
          {/* Two lines keep the table within the card once the full run ID is shown */}
          <div className="grid">
            <span>{formatDate(run.startedAt)}</span>
            <span className="text-xs text-muted-foreground">
              {formatTime(run.startedAt)}
            </span>
          </div>
        </TableCell>
        <TableCell className="pr-5 text-right">
          <Button
            variant="ghost"
            size="sm"
            disabled={isViewing}
            onClick={() => onView(run.id)}
          >
            {t("runs.view")}
          </Button>
        </TableCell>
      </TableRow>
    );
  });
}

function MessageRow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <TableRow>
      <TableCell
        colSpan={COLUMN_COUNT}
        className={cn("h-24 text-center text-muted-foreground", className)}
      >
        {children}
      </TableCell>
    </TableRow>
  );
}

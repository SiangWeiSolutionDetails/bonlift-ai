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
import { formatDateTime } from "@/lib/date-format";
import { getErrorMessage } from "@/lib/error-message";
import { cn } from "@/lib/utils";
import { formatDuration, formatWindow } from "../format";
import type { OutletItemScoresRun } from "../type";
import { RunConfigBadges, RunStatusBadge } from "./run-badges";

const COLUMN_COUNT = 7;
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
              <TableHead className="pl-5">{t("runs.window")}</TableHead>
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
        <TableCell className="pl-5 font-medium">
          <div className="flex flex-wrap items-center gap-2">
            {formatWindow(run.from, run.to)}
            {run.isPublished && <Badge>{t("runs.published")}</Badge>}
          </div>
        </TableCell>
        <TableCell className="min-w-60">
          <RunConfigBadges run={run} />
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
        <TableCell className="text-muted-foreground">
          {formatDateTime(run.startedAt)}
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

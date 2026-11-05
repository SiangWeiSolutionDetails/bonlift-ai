import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/components/confirm-dialog";
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
import { formatDuration, formatWindow } from "../format";
import { usePublishOutletItemScoresRun } from "../queries";
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
  onPublished: (runId: string) => void;
};

export function RunsCard({ onPublished, ...props }: RunsCardProps) {
  const { t } = useTranslation("results");
  const { t: tCommon } = useTranslation();
  const publish = usePublishOutletItemScoresRun();
  const [runToPublish, setRunToPublish] = useState<OutletItemScoresRun | null>(null);

  function confirmPublish(run: OutletItemScoresRun) {
    publish.mutate(run, { onSuccess: () => onPublished(run.id) });
  }

  return (
    <SectionCard title={t("runs.title")}>
      <ConfirmDialog
        open={runToPublish !== null}
        onCancel={() => setRunToPublish(null)}
        onConfirm={() => runToPublish && confirmPublish(runToPublish)}
        title={t("runs.publishConfirmTitle")}
        description={
          runToPublish
            ? t("runs.publishConfirmDescription", {
                window: formatWindow(runToPublish.from, runToPublish.to),
              })
            : undefined
        }
        confirmLabel={t("runs.publish")}
      />

      {publish.error && (
        <p className="-mt-2 text-sm text-destructive">
          {getErrorMessage(publish.error, tCommon)}
        </p>
      )}

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
            <RunRows
              {...props}
              isPublishing={publish.isPending}
              onPublish={setRunToPublish}
            />
          </TableBody>
        </Table>
      </div>
    </SectionCard>
  );
}

// Mirrors the API rule: only a finished run with results can go live.
function canPublish(run: OutletItemScoresRun) {
  return !run.isPublished && run.status === "succeeded" && (run.rowCount ?? 0) > 0;
}

type RunRowsProps = Omit<RunsCardProps, "onPublished"> & {
  isPublishing: boolean;
  onPublish: (run: OutletItemScoresRun) => void;
};

function RunRows({
  runs,
  isPending,
  error,
  viewingRunId,
  onView,
  isPublishing,
  onPublish,
}: RunRowsProps) {
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
          <div className="flex items-center gap-2">
            {/* Fixed width with the icon at its end, so the copy icons line up down the column */}
            <CopyableId id={run.id} short className="flex w-25 shrink-0 justify-between" />
            {run.isPublished && <Badge>{t("runs.published")}</Badge>}
          </div>
        </TableCell>
        <TableCell>
          {/* Dates stacked to leave width for the action buttons */}
          <div className="grid font-medium">
            <span>{formatDate(run.from)}</span>
            <span>{formatDate(run.to)}</span>
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
          <div className="grid">
            <span>{formatDate(run.startedAt)}</span>
            <span className="text-xs text-muted-foreground">
              {formatTime(run.startedAt)}
            </span>
          </div>
        </TableCell>
        <TableCell className="pr-5">
          <div className="flex justify-end gap-1">
            <Button
              variant="ghost"
              size="sm"
              disabled={isViewing}
              onClick={() => onView(run.id)}
            >
              {t("runs.view")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={!canPublish(run) || isPublishing}
              onClick={() => onPublish(run)}
            >
              {t("runs.publish")}
            </Button>
          </div>
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

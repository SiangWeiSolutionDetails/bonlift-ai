import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ALL_DAY_DAYPART } from "@ai-services/contracts";
import { FieldHint } from "@/components/field-hint";
import { SectionCard } from "@/components/section-card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatDateTime } from "@/lib/date-format";
import { getErrorMessage } from "@/lib/error-message";
import { cn } from "@/lib/utils";
import { formatDuration, formatShare, formatWindow } from "../format";
import { useOutletItemScoresRunResult } from "../queries";
import { groupByDaypart, orderDayparts } from "../ranking";
import type { OutletItemScore, OutletItemScoresRun } from "../type";
import { CopyableId } from "./copyable-id";
import { RunConfigBadge, RunStatusBadge } from "./run-badges";

type RankingCardProps = {
  run: OutletItemScoresRun;
};

export function RankingCard({ run }: RankingCardProps) {
  return (
    <SectionCard>
      <RunDetails run={run} />
      <RankingBody run={run} />
    </SectionCard>
  );
}

// Same facts as the run's row in the runs table, so the ranking can be read without scrolling down
function RunDetails({ run }: RankingCardProps) {
  const { t } = useTranslation("results");

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

function RankingBody({ run }: RankingCardProps) {
  const { t } = useTranslation("results");
  const { t: tCommon } = useTranslation();
  const result = useOutletItemScoresRunResult(run.id, run.status);
  const groups = useMemo(() => groupByDaypart(result.data?.items ?? []), [result.data]);
  const [selectedDaypart, setSelectedDaypart] = useState<string | undefined>();

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
  if (result.isPending) {
    return <Skeleton className="h-64 w-full" />;
  }
  if (result.error) {
    return (
      <Message className="text-destructive">
        {getErrorMessage(result.error, tCommon)}
      </Message>
    );
  }
  if (groups.size === 0) {
    return <Message>{t("ranking.empty")}</Message>;
  }

  const dayparts = orderDayparts(run, [...groups.keys()]);
  // Fall back to the first daypart when the selection doesn't exist in this run
  const daypart =
    selectedDaypart && groups.has(selectedDaypart) ? selectedDaypart : dayparts[0];

  return (
    <div className="flex flex-col gap-4">
      <ToggleGroup
        type="single"
        variant="outline"
        value={daypart}
        onValueChange={(value) => value && setSelectedDaypart(value)}
        className="flex-wrap"
      >
        {dayparts.map((option) => (
          <ToggleGroupItem key={option} value={option}>
            {option === ALL_DAY_DAYPART ? t("ranking.allDay") : option}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <DaypartRanking items={groups.get(daypart) ?? []} />
    </div>
  );
}

function DaypartRanking({ items }: { items: OutletItemScore[] }) {
  const { t, i18n } = useTranslation("results");

  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12 text-right">{t("ranking.rank")}</TableHead>
            <TableHead>{t("ranking.item")}</TableHead>
            <TableHead className="min-w-56">
              <span className="inline-flex items-center gap-1.5">
                {t("ranking.share")}
                <FieldHint id="ranking-share-hint" hint={t("ranking.shareHint")} />
              </span>
            </TableHead>
            <TableHead className="text-right">{t("ranking.orders")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.itemId}>
              <TableCell className="text-right font-semibold tabular-nums">
                {item.rank}
              </TableCell>
              <TableCell>
                <ItemLabel item={item} />
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-3">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${item.score * 100}%` }}
                    />
                  </div>
                  <span className="w-14 text-right text-sm tabular-nums">
                    {formatShare(item.score, i18n.language)}
                  </span>
                </div>
              </TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {item.nOrders.toLocaleString(i18n.language)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ItemLabel({ item }: { item: OutletItemScore }) {
  return (
    <div className="grid">
      <span className="font-medium">{item.itemName ?? item.itemId}</span>
      {item.itemName && (
        <span className="text-xs text-muted-foreground">{item.itemId}</span>
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

import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CircleCheckIcon,
  CircleXIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { SectionCard } from "@/components/section-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatWindow } from "@/features/outlet-item-scores/format";
import { formatDate, formatTime } from "@/lib/date-format";
import { getErrorMessage } from "@/lib/error-message";
import { cn } from "@/lib/utils";
import { formatKilobytes } from "../format";
import { useOrderSnapshotCoverage } from "../queries";
import type { OrderSnapshotCoverage, OrderSnapshotDay } from "../type";
import { OrderSnapshotDialog } from "./order-snapshot-dialog";

const COLUMN_COUNT = 6;
const SKELETON_ROW_COUNT = 5;

type SortDirection = "asc" | "desc";

const DAY_FILTERS = ["all", "stored", "missing"] as const;
type DayFilter = (typeof DAY_FILTERS)[number];

// Same colours as the row status badges, so an option reads as the badge it filters for.
const FILTER_BADGE_VARIANT = {
  all: "outline",
  stored: "success",
  missing: "destructive",
} as const;

const FILTER_BADGE_ICON = {
  all: null,
  stored: CircleCheckIcon,
  missing: CircleXIcon,
};

function matchesFilter(day: OrderSnapshotDay, filter: DayFilter) {
  if (filter === "stored") return day.isStored;
  if (filter === "missing") return !day.isStored;
  return true;
}

export function OrderSnapshotsCard({ outletId }: { outletId: string }) {
  const { t } = useTranslation("snapshots");
  const coverage = useOrderSnapshotCoverage(outletId);
  const [dateSort, setDateSort] = useState<SortDirection>("desc");
  const [dayFilter, setDayFilter] = useState<DayFilter>("all");
  const [viewingDay, setViewingDay] = useState<OrderSnapshotDay | undefined>();

  // The API returns newest first; ISO dates sort correctly as strings.
  const visibleDays = useMemo(() => {
    const days = coverage.data?.days.filter((day) => matchesFilter(day, dayFilter));
    if (!days || dateSort === "desc") return days;
    return days.sort((a, b) => a.date.localeCompare(b.date));
  }, [coverage.data?.days, dayFilter, dateSort]);

  return (
    <SectionCard>
      <OrderSnapshotDialog
        outletId={outletId}
        day={viewingDay}
        onClose={() => setViewingDay(undefined)}
      />

      {coverage.data && <CoverageSummary coverage={coverage.data} />}

      <div className="flex items-center gap-3">
        <Label htmlFor="snapshots-status-filter" className="shrink-0">
          {t("filter.label")}
        </Label>
        <Select
          value={dayFilter}
          onValueChange={(value) => setDayFilter(value as DayFilter)}
        >
          <SelectTrigger id="snapshots-status-filter" className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DAY_FILTERS.map((filter) => {
              const Icon = FILTER_BADGE_ICON[filter];
              return (
                <SelectItem key={filter} value={filter}>
                  <Badge variant={FILTER_BADGE_VARIANT[filter]}>
                    {Icon && <Icon />}
                    {t(`filter.${filter}`)}
                  </Badge>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      <div className="-mx-5 -mb-5 overflow-x-auto border-t">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead
                className="pl-3"
                aria-sort={dateSort === "asc" ? "ascending" : "descending"}
              >
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDateSort(dateSort === "asc" ? "desc" : "asc")}
                >
                  {t("card.date")}
                  {dateSort === "asc" ? (
                    <ArrowUpIcon data-icon="inline-end" />
                  ) : (
                    <ArrowDownIcon data-icon="inline-end" />
                  )}
                </Button>
              </TableHead>
              <TableHead>{t("card.status")}</TableHead>
              <TableHead className="text-right">{t("card.orders")}</TableHead>
              <TableHead>{t("card.updated")}</TableHead>
              <TableHead className="text-right">{t("card.size")}</TableHead>
              <TableHead className="pr-5 text-right">
                <span className="sr-only">{t("card.actions")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <DayRows
              days={visibleDays}
              hasAnyDays={Boolean(coverage.data?.days.length)}
              isPending={coverage.isPending}
              error={coverage.error}
              onView={setViewingDay}
            />
          </TableBody>
        </Table>
      </div>
    </SectionCard>
  );
}

// Same label-over-value layout as the ranking card's run details
function CoverageSummary({ coverage }: { coverage: OrderSnapshotCoverage }) {
  const { t } = useTranslation("snapshots");
  const stored = coverage.days.filter((day) => day.isStored).length;
  const stale = coverage.days.filter((day) => day.isStale).length;

  return (
    <dl className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
      <Detail label={t("summary.stored")}>
        <span className="tabular-nums">{stored}</span>
      </Detail>
      <Detail label={t("summary.missing")}>
        <span className="tabular-nums">{coverage.days.length - stored}</span>
      </Detail>
      <Detail label={t("summary.stale")}>
        <span className="tabular-nums">{stale}</span>
      </Detail>
      <Detail label={t("summary.liveRun")}>
        {coverage.publishedRun
          ? formatWindow(coverage.publishedRun.from, coverage.publishedRun.to)
          : "—"}
      </Detail>
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

function DayRows({
  days,
  hasAnyDays,
  isPending,
  error,
  onView,
}: {
  days: OrderSnapshotDay[] | undefined;
  hasAnyDays: boolean;
  isPending: boolean;
  error: Error | null;
  onView: (day: OrderSnapshotDay) => void;
}) {
  const { t, i18n } = useTranslation("snapshots");
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

  if (!days?.length) {
    return <MessageRow>{t(hasAnyDays ? "filter.noMatch" : "card.empty")}</MessageRow>;
  }

  return days.map((day) => (
    <TableRow key={day.date} className={cn(!day.isStored && "text-muted-foreground")}>
      <TableCell className="pl-5 font-medium">{formatDate(day.date)}</TableCell>
      <TableCell>
        <DayStatusBadge day={day} />
      </TableCell>
      <TableCell className="text-right tabular-nums">{day.orderCount ?? "—"}</TableCell>
      <TableCell>
        {day.updatedAt ? (
          <div className="grid">
            <span>{formatDate(day.updatedAt)}</span>
            <span className="text-xs text-muted-foreground">{formatTime(day.updatedAt)}</span>
          </div>
        ) : (
          "—"
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {day.sizeBytes === null ? "—" : formatKilobytes(day.sizeBytes, i18n.language)}
      </TableCell>
      <TableCell className="pr-5 text-right">
        {day.isStored && (
          <Button variant="ghost" size="sm" onClick={() => onView(day)}>
            {t("card.viewSnapshot")}
          </Button>
        )}
      </TableCell>
    </TableRow>
  ));
}

function DayStatusBadge({ day }: { day: OrderSnapshotDay }) {
  const { t } = useTranslation("snapshots");

  if (!day.isStored) {
    return (
      <Badge variant="destructive">
        <CircleXIcon />
        {t("status.missing")}
      </Badge>
    );
  }
  if (day.isStale) {
    return (
      <Badge variant="secondary" title={t("status.staleHint")}>
        {t("status.stale")}
      </Badge>
    );
  }
  return (
    <Badge variant="success">
      <CircleCheckIcon />
      {t("status.stored")}
    </Badge>
  );
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

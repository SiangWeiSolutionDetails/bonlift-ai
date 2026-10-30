import { useMemo } from "react";
import { TrendingUpIcon } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getErrorMessage } from "@/lib/error-message";
import { cn } from "@/lib/utils";
import { formatShare, formatWindow, shortId } from "../format";
import { useOutletItemScoresRunResult } from "../queries";
import { groupByDaypart, orderDayparts } from "../ranking";
import type { OutletItemScore, OutletItemScoresRun } from "../type";

type RankingCardProps = {
  run: OutletItemScoresRun;
};

export function RankingCard({ run }: RankingCardProps) {
  const { t } = useTranslation("results");

  return (
    <SectionCard title={t("ranking.title")} icon={TrendingUpIcon}>
      <p className="-mt-3 text-sm text-muted-foreground">
        {t("ranking.run", {
          id: shortId(run.id),
          window: formatWindow(run.from, run.to),
        })}
      </p>
      <RankingBody run={run} />
    </SectionCard>
  );
}

function RankingBody({ run }: RankingCardProps) {
  const { t } = useTranslation("results");
  const { t: tCommon } = useTranslation();
  const result = useOutletItemScoresRunResult(run.id, run.status);
  const groups = useMemo(() => groupByDaypart(result.data?.items ?? []), [result.data]);

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

  return (
    <Tabs defaultValue={dayparts[0]} className="gap-4">
      <TabsList className="flex-wrap">
        {dayparts.map((daypart) => (
          <TabsTrigger key={daypart} value={daypart}>
            {daypart === ALL_DAY_DAYPART ? t("ranking.allDay") : daypart}
          </TabsTrigger>
        ))}
      </TabsList>
      {dayparts.map((daypart) => (
        <TabsContent key={daypart} value={daypart}>
          <DaypartRanking items={groups.get(daypart) ?? []} />
        </TabsContent>
      ))}
    </Tabs>
  );
}

function DaypartRanking({ items }: { items: OutletItemScore[] }) {
  const { t, i18n } = useTranslation("results");
  // Bars are relative to the daypart's leader, so the spread stays readable when scores are small
  const maxScore = items[0]?.score || 1;

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
                      style={{ width: `${(item.score / maxScore) * 100}%` }}
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

import { useTranslation } from "react-i18next";
import { FieldHint } from "@/components/field-hint";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatShare, getMaxValue, toBarWidth } from "@/features/outlet-item-scores/format";
import { getErrorMessage } from "@/lib/error-message";
import { useRunCustomer } from "../queries";
import type { CustomerItemScore } from "../type";

type CustomerRankingProps = {
  runId: string;
  customerId: string;
};

export function CustomerRanking({ runId, customerId }: CustomerRankingProps) {
  const { t, i18n } = useTranslation("customerScores");
  const { t: tCommon } = useTranslation();
  const result = useRunCustomer(runId, customerId);

  if (result.isPending) {
    return <Skeleton className="h-64 w-full" />;
  }
  if (result.error) {
    return (
      <p className="py-10 text-center text-sm text-destructive">
        {getErrorMessage(result.error, tCommon)}
      </p>
    );
  }

  const items = result.data.items;
  const topScore = getMaxValue(items.map((item) => item.score));

  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12 text-right">{t("ranking.rank")}</TableHead>
            <TableHead>{t("ranking.item")}</TableHead>
            <TableHead className="min-w-56">
              <span className="inline-flex items-center gap-1.5">
                {t("ranking.score")}
                <FieldHint id="customer-ranking-score-hint" hint={t("ranking.scoreHint")} />
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
                  <div className="h-2.5 flex-1">
                    <div
                      className="h-full min-w-0.5 rounded-sm bg-primary"
                      style={{ width: toBarWidth(item.score, topScore) }}
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

function ItemLabel({ item }: { item: CustomerItemScore }) {
  return (
    <div className="grid">
      <span className="font-medium">{item.itemName ?? item.itemId}</span>
      {item.itemName && (
        <span className="text-xs text-muted-foreground">{item.itemId}</span>
      )}
    </div>
  );
}

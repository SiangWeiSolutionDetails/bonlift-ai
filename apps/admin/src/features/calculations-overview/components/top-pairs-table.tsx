import { useTranslation } from "react-i18next";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { TopPair } from "../type";

function PairLabel({ pair }: { pair: TopPair }) {
  return (
    <>
      {pair.itemAName ?? <span className="font-mono">{pair.itemA}</span>}
      <span className="text-muted-foreground"> → </span>
      {pair.itemBName ?? <span className="font-mono">{pair.itemB}</span>}
    </>
  );
}

export function TopPairsTable({ pairs }: { pairs: TopPair[] }) {
  const { t, i18n } = useTranslation("calculations");
  const percent = new Intl.NumberFormat(i18n.language, {
    style: "percent",
    maximumFractionDigits: 1,
  });

  return (
    <div className="grid min-w-0 gap-3">
      <div className="grid gap-1">
        <h4 className="text-sm font-medium">{t("topPairs.title")}</h4>
        <p className="text-xs text-muted-foreground">{t("topPairs.description")}</p>
      </div>
      {pairs.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t("topPairs.empty")}</p>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("topPairs.pair")}</TableHead>
                <TableHead className="text-right">{t("topPairs.confidence")}</TableHead>
                <TableHead className="text-right">{t("topPairs.lift")}</TableHead>
                <TableHead className="text-right">{t("topPairs.orders")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pairs.map((pair) => (
                <TableRow key={`${pair.itemA}-${pair.itemB}`}>
                  <TableCell className="whitespace-normal">
                    <PairLabel pair={pair} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {percent.format(pair.confidence)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{pair.lift.toFixed(2)}×</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {pair.nPair.toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

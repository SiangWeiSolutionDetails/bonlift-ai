import { useTranslation } from "react-i18next";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { TopItem } from "../type";

export function TopItemsTable({ items }: { items: TopItem[] }) {
  const { t } = useTranslation("calculations");

  return (
    <section className="grid min-w-0 content-start gap-3 rounded-xl bg-card p-5 shadow-panel">
      <div className="grid gap-1">
        <h3 className="text-sm font-medium">{t("topItems.title")}</h3>
        <p className="text-xs text-muted-foreground">{t("topItems.description")}</p>
      </div>
      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t("topItems.empty")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("topItems.item")}</TableHead>
              <TableHead className="text-right">{t("topItems.orders")}</TableHead>
              <TableHead className="text-right">{t("topItems.outlets")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.itemId}>
                <TableCell className="whitespace-normal">
                  {item.itemName ?? <span className="font-mono">{item.itemId}</span>}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {item.nOrders.toLocaleString()}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {item.outlets.toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}

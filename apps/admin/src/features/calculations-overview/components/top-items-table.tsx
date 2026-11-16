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
    <div className="grid min-w-0 gap-3">
      <div className="grid gap-1">
        <h4 className="text-sm font-medium">{t("topItems.title")}</h4>
        <p className="text-xs text-muted-foreground">{t("topItems.description")}</p>
      </div>
      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t("topItems.empty")}</p>
      ) : (
        <div className="overflow-hidden rounded-lg border">
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
        </div>
      )}
    </div>
  );
}

import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatWindow } from "@/features/outlet-item-scores/format";
import type { CalculationOutlet } from "../type";
import { CalculationStatusBadge } from "./calculation-status-badge";

type OutletRunsTableProps = {
  brandId: string;
  outlets: CalculationOutlet[];
};

export function OutletRunsTable({ brandId, outlets }: OutletRunsTableProps) {
  const { t } = useTranslation("calculations");

  if (outlets.length === 0) {
    return <p className="py-4 text-center text-sm text-muted-foreground">{t("outlets.empty")}</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("outlets.outlet")}</TableHead>
          <TableHead>{t("outlets.status")}</TableHead>
          <TableHead>{t("outlets.publishedWindow")}</TableHead>
          <TableHead>{t("outlets.hasData")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {outlets.map((outlet) => (
          <TableRow key={outlet.outletId}>
            <TableCell>
              <span className="flex items-center gap-2">
                <Link
                  to="/results"
                  search={{ brandId, outletId: outlet.outletId }}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {outlet.outletName}
                </Link>
                {!outlet.isActive && <Badge variant="outline">{t("outlets.inactive")}</Badge>}
              </span>
            </TableCell>
            <TableCell>
              <CalculationStatusBadge run={outlet.latestRun} />
            </TableCell>
            <TableCell className={outlet.publishedRun ? undefined : "text-muted-foreground"}>
              {outlet.publishedRun
                ? formatWindow(outlet.publishedRun.from, outlet.publishedRun.to)
                : t("card.nothingPublished")}
            </TableCell>
            <TableCell className={outlet.hasOrdersInWindow ? undefined : "text-destructive"}>
              {outlet.hasOrdersInWindow ? t("outlets.yes") : t("outlets.no")}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

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
import type { CalculationOutlet } from "../type";
import { CalculationStatusBadge } from "./calculation-status-badge";
import { PublishedRun } from "./published-run";

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
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("outlets.outlet")}</TableHead>
            <TableHead>{t("outlets.status")}</TableHead>
            <TableHead>{t("outlets.publishedWindow")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {outlets.map((outlet) => (
            <TableRow key={outlet.outletId}>
              <TableCell>
                <span className="flex items-center gap-2">
                  <Link
                    to="/b/$brandId/results"
                    params={{ brandId }}
                    search={{ outletId: outlet.outletId }}
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
                {outlet.publishedRun ? (
                  <PublishedRun
                    run={outlet.publishedRun}
                    target={{
                      to: "/b/$brandId/results",
                      params: { brandId },
                      search: { outletId: outlet.outletId, runId: outlet.publishedRun.id },
                    }}
                  />
                ) : (
                  t("card.nothingPublished")
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

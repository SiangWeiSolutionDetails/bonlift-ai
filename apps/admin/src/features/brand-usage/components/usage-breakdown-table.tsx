import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { ServingCallCountsSchemaType } from "@bonlift-ai/contracts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const COUNT_KEYS = ["succeeded", "clientErrors", "serverErrors"] as const;

export type UsageBreakdownRow = ServingCallCountsSchemaType & {
  id: string;
  label: ReactNode;
};

type UsageBreakdownTableProps = {
  title: string;
  rows: UsageBreakdownRow[];
};

// API calls split by one dimension (channel or key), same counts as the days table.
export function UsageBreakdownTable({ title, rows }: UsageBreakdownTableProps) {
  const { t } = useTranslation("usage");

  return (
    <div className="grid content-start gap-3 rounded-xl bg-card p-5 shadow-panel">
      <h3 className="text-sm font-medium">{title}</h3>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t("days.empty")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("breakdown.name")}</TableHead>
              {COUNT_KEYS.map((key) => (
                <TableHead key={key} className="text-right">
                  {t(`counts.${key}`)}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.label}</TableCell>
                {COUNT_KEYS.map((key) => (
                  <TableCell
                    key={key}
                    className={row[key] === 0 ? "text-right text-muted-foreground" : "text-right"}
                  >
                    {row[key].toLocaleString()}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

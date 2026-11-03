import { useTranslation } from "react-i18next";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/date-format";
import { sumUsageDays } from "../days";
import type { BrandUsageDay } from "../type";

const COUNT_KEYS = ["succeeded", "clientErrors", "serverErrors", "calculationRuns"] as const;

export function UsageDaysTable({ days }: { days: BrandUsageDay[] }) {
  const { t } = useTranslation("usage");
  const totals = sumUsageDays(days);

  if (days.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{t("days.empty")}</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("days.date")}</TableHead>
          {COUNT_KEYS.map((key) => (
            <TableHead key={key} className="text-right">
              {t(`counts.${key}`)}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {days.map((day) => (
          <TableRow key={day.date}>
            <TableCell>{formatDate(day.date)}</TableCell>
            {COUNT_KEYS.map((key) => (
              <TableCell
                key={key}
                className={day[key] === 0 ? "text-right text-muted-foreground" : "text-right"}
              >
                {day[key].toLocaleString()}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell className="font-medium">{t("days.total")}</TableCell>
          {COUNT_KEYS.map((key) => (
            <TableCell key={key} className="text-right font-medium">
              {totals[key].toLocaleString()}
            </TableCell>
          ))}
        </TableRow>
      </TableFooter>
    </Table>
  );
}

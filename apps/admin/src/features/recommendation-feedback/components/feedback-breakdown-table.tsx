import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { OUTCOMES, formatRate } from "../feedback";
import type { FeedbackBreakdownRow, FeedbackReport } from "../type";
import { useFeedbackLabels } from "../use-feedback-labels";

const DIMENSIONS = ["byItem", "byOutlet", "byReason", "byDaypart"] as const;
type Dimension = (typeof DIMENSIONS)[number];

export function FeedbackBreakdownTable({ report }: { report: FeedbackReport }) {
  const { t } = useTranslation("recommendationFeedback");
  const [dimension, setDimension] = useState<Dimension>("byItem");

  return (
    <div className="grid content-start gap-4 rounded-xl bg-card p-5 shadow-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-medium">{t("breakdown.title")}</h3>
        <ToggleGroup
          type="single"
          variant="outline"
          value={dimension}
          // Radix emits "" when the active item is clicked again; keep one dimension always selected
          onValueChange={(value) => value && setDimension(value as Dimension)}
          aria-label={t("breakdown.title")}
          className="flex-wrap"
        >
          {DIMENSIONS.map((option) => (
            <ToggleGroupItem key={option} value={option}>
              {t(`breakdown.${option}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <BreakdownRows dimension={dimension} rows={report[dimension]} />
    </div>
  );
}

function BreakdownRows({ dimension, rows }: { dimension: Dimension; rows: FeedbackBreakdownRow[] }) {
  const { t, i18n } = useTranslation("recommendationFeedback");
  const { reasonLabel, daypartLabel } = useFeedbackLabels();

  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{t("breakdown.empty")}</p>;
  }

  const rowLabel = (row: FeedbackBreakdownRow) => {
    if (dimension === "byReason") return reasonLabel(row.key);
    if (dimension === "byDaypart") return daypartLabel(row.key);
    return row.label;
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("breakdown.name")}</TableHead>
          <TableHead className="text-right">{t("breakdown.servedItems")}</TableHead>
          {OUTCOMES.map((outcome) => (
            <TableHead key={outcome} className="text-right">
              {t(`outcomes.${outcome}`)}
            </TableHead>
          ))}
          <TableHead className="text-right">{t("breakdown.acceptanceRate")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.key}>
            <TableCell className={dimension === "byItem" ? "font-mono text-xs" : undefined}>
              {rowLabel(row)}
            </TableCell>
            <TableCell className="text-right">{row.servedItems.toLocaleString()}</TableCell>
            {OUTCOMES.map((outcome) => (
              <TableCell
                key={outcome}
                className={row[outcome] === 0 ? "text-right text-muted-foreground" : "text-right"}
              >
                {row[outcome].toLocaleString()}
              </TableCell>
            ))}
            <TableCell className="text-right font-medium">
              {formatRate(row.acceptanceRate, i18n.language)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

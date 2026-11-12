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
import { OUTCOMES } from "../feedback";
import type { FeedbackBreakdownRow, FeedbackReport, FeedbackRunRow } from "../type";
import { useFeedbackLabels } from "../use-feedback-labels";
import { RunName } from "./run-name";

const DIMENSIONS = ["byItem", "byOutlet", "byReason", "byDaypart", "byRun"] as const;
type Dimension = (typeof DIMENSIONS)[number];

type FeedbackBreakdownTableProps = {
  report: FeedbackReport;
  onSelectRun: (runId: string) => void;
};

export function FeedbackBreakdownTable({ report, onSelectRun }: FeedbackBreakdownTableProps) {
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
      <BreakdownRows dimension={dimension} rows={report[dimension]} onSelectRun={onSelectRun} />
    </div>
  );
}

type BreakdownRowsProps = {
  dimension: Dimension;
  rows: (FeedbackBreakdownRow | FeedbackRunRow)[];
  onSelectRun: (runId: string) => void;
};

function isRunRow(row: FeedbackBreakdownRow | FeedbackRunRow): row is FeedbackRunRow {
  return "jobType" in row;
}

function BreakdownRows({ dimension, rows, onSelectRun }: BreakdownRowsProps) {
  const { t } = useTranslation("recommendationFeedback");
  const { reasonLabel, daypartLabel } = useFeedbackLabels();

  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{t("breakdown.empty")}</p>;
  }

  const rowLabel = (row: FeedbackBreakdownRow | FeedbackRunRow) => {
    // A run row filters the page to that run
    if (isRunRow(row)) {
      return (
        <button type="button" className="text-left hover:underline" onClick={() => onSelectRun(row.key)}>
          <RunName runId={row.key} run={row} />
        </button>
      );
    }
    if (dimension === "byReason") return reasonLabel(row.key);
    if (dimension === "byDaypart") return daypartLabel(row.key);
    return row.label;
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t(dimension === "byRun" ? "breakdown.run" : "breakdown.name")}</TableHead>
          {OUTCOMES.map((outcome) => (
            <TableHead key={outcome} className="text-right">
              {t(`outcomes.${outcome}`)}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.key}>
            <TableCell className={dimension === "byItem" ? "font-mono text-xs" : undefined}>
              {rowLabel(row)}
            </TableCell>
            {OUTCOMES.map((outcome) => (
              <TableCell
                key={outcome}
                className={row[outcome] === 0 ? "text-right text-muted-foreground" : "text-right"}
              >
                {row[outcome].toLocaleString()}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

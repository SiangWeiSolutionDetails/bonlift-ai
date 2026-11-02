import type { ReactNode } from "react";
import { InfoIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";

const EXAMPLE_WEIGHTS = [
  { days: 0, weight: 1 },
  { days: 7, weight: 0.71 },
  { days: 14, weight: 0.5 },
  { days: 28, weight: 0.25 },
];

function FormulaPanel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-muted p-3">
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      {children}
    </div>
  );
}

export function ScoreFormula() {
  const { t } = useTranslation("results");

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="text-muted-foreground">
          <InfoIcon data-icon="inline-start" />
          {t("formula.title")}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        aria-label={t("formula.title")}
        className="w-[28rem] max-w-[calc(100vw-2rem)] gap-3 p-4"
      >
        <div>
          <PopoverTitle>{t("formula.ranking")}</PopoverTitle>
          <PopoverDescription>{t("formula.tieBreak")}</PopoverDescription>
        </div>
        <FormulaPanel label={t("formula.scoreLabel")}>
          <div className="mx-auto flex w-fit flex-col items-center gap-1 text-center font-medium">
            <span>{t("formula.scoreNumerator")}</span>
            <span className="sr-only">÷</span>
            <Separator className="bg-muted-foreground" />
            <span>{t("formula.scoreDenominator")}</span>
          </div>
        </FormulaPanel>
        <FormulaPanel label={t("formula.weightLabel")}>
          <p className="text-center font-medium">
            0.5<sup className="ml-0.5">{t("formula.weightExponent")}</sup>
          </p>
          <p className="text-center text-xs text-muted-foreground">
            {t("formula.weightHint")}
          </p>
        </FormulaPanel>
        <div className="flex flex-col gap-2">
          <PopoverTitle>{t("formula.exampleTitle")}</PopoverTitle>
          {EXAMPLE_WEIGHTS.map(({ days, weight }) => (
            <div key={days} className="flex items-center gap-3">
              <span className="w-16 shrink-0 whitespace-nowrap text-muted-foreground tabular-nums">
                {t("formula.exampleDays", { count: days })}
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${weight * 100}%` }}
                />
              </div>
              <span className="w-9 text-right tabular-nums">{weight}</span>
            </div>
          ))}
        </div>
        <Separator />
        <PopoverDescription className="text-xs">{t("formula.note")}</PopoverDescription>
      </PopoverContent>
    </Popover>
  );
}

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

function Fraction({
  numerator,
  denominator,
}: {
  numerator: string;
  denominator: string;
}) {
  return (
    <div className="mx-auto flex w-fit flex-col items-center gap-1 text-center font-medium">
      <span>{numerator}</span>
      <span className="sr-only">÷</span>
      <Separator className="bg-muted-foreground" />
      <span>{denominator}</span>
    </div>
  );
}

export function ScoreFormula() {
  const { t } = useTranslation("itemAffinity");

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
        <FormulaPanel label={t("formula.confidenceLabel")}>
          <Fraction
            numerator={t("formula.confidenceNumerator")}
            denominator={t("formula.confidenceDenominator")}
          />
        </FormulaPanel>
        <FormulaPanel label={t("formula.liftLabel")}>
          <Fraction
            numerator={t("formula.liftNumerator")}
            denominator={t("formula.liftDenominator")}
          />
          <p className="text-center text-xs text-muted-foreground">
            {t("formula.liftHint")}
          </p>
        </FormulaPanel>
        <Separator />
        <PopoverDescription className="text-xs">{t("formula.note")}</PopoverDescription>
      </PopoverContent>
    </Popover>
  );
}

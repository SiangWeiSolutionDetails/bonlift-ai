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

export function ScoreFormula() {
  const { t } = useTranslation("customerScores");

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
        className="w-[34rem] max-w-[calc(100vw-2rem)] p-4"
      >
        <PopoverTitle>{t("formula.share")}</PopoverTitle>
        <PopoverDescription>{t("formula.recency")}</PopoverDescription>
      </PopoverContent>
    </Popover>
  );
}

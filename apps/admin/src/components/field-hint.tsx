import { useTranslation } from "react-i18next";
import { InfoIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type FieldHintProps = {
  id: string;
  hint: string;
};

export function FieldHint({ id, hint }: FieldHintProps) {
  const { t } = useTranslation();
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={t("actions.showHint")}
            className="inline-flex size-4 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <InfoIcon className="size-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent>{hint}</TooltipContent>
      </Tooltip>
      {/* Tooltip content only mounts while open, so aria-describedby targets this instead */}
      <span id={id} className="sr-only">
        {hint}
      </span>
    </>
  );
}

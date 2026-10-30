import { useEffect, useState } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const COPIED_FEEDBACK_MS = 1500;

const SHORT_ID_LENGTH = 8;

type CopyableIdProps = {
  id: string;
  // Show only the first segment; the full id stays in the tooltip and the clipboard
  short?: boolean;
  className?: string;
};

export function CopyableId({ id, short, className }: CopyableIdProps) {
  const { t } = useTranslation("results");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
    } catch {
      // Clipboard can be blocked (insecure origin, permissions); the id stays selectable as text
    }
  }

  const label = copied ? t("ranking.copied") : t("ranking.copyRunId");

  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap", className)}>
      <span title={short ? id : undefined}>
        {short ? id.slice(0, SHORT_ID_LENGTH) : id}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={copy}
        aria-label={label}
        title={label}
        className="text-muted-foreground hover:text-foreground"
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </Button>
    </span>
  );
}

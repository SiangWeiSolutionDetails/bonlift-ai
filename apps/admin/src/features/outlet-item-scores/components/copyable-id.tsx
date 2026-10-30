import { useEffect, useState } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const COPIED_FEEDBACK_MS = 1500;

export function CopyableId({ id, className }: { id: string; className?: string }) {
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
      <span>{id}</span>
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

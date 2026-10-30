import { useEffect, useState } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";

const COPIED_FEEDBACK_MS = 1500;

export function CopyableId({ id }: { id: string }) {
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

  return (
    <Badge variant="secondary" asChild>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? t("ranking.copied") : t("ranking.copyRunId")}
        title={copied ? t("ranking.copied") : t("ranking.copyRunId")}
        className="cursor-pointer font-mono select-all"
      >
        {id}
        {copied ? <CheckIcon /> : <CopyIcon />}
      </button>
    </Badge>
  );
}

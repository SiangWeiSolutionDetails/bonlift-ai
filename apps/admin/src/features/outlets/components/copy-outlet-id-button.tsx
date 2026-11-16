import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { writeToClipboard } from "@/features/brand-api-keys/components/secret-key-field";
import type { Outlet } from "../type";

const COPIED_FEEDBACK_MS = 1500;

export function CopyOutletIdButton({ outlet }: { outlet: Outlet }) {
  const { t } = useTranslation("outlets");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await writeToClipboard(outlet.id);
      setCopied(true);
    } catch {
      // Both clipboard paths failed; nothing else to fall back to from a table row
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={copy}
      aria-label={t("table.copyOutletId", { name: outlet.name })}
      className="text-muted-foreground"
    >
      {/* Both labels share one grid cell so the width is the wider label's, in any language */}
      <span className="grid">
        <span className={cn("col-start-1 row-start-1", copied && "invisible")}>
          {t("table.copyId")}
        </span>
        <span className={cn("col-start-1 row-start-1", !copied && "invisible")}>
          {t("table.copied")}
        </span>
      </span>
    </Button>
  );
}

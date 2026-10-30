import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";

// Neutral on purpose, so settings never compete with status colours: grey in light mode, the default secondary badge in dark mode.
export function SettingBadge({ children }: { children: ReactNode }) {
  return (
    <Badge
      variant="secondary"
      className="bg-zinc-200 text-zinc-800 dark:bg-secondary dark:text-secondary-foreground"
    >
      {children}
    </Badge>
  );
}

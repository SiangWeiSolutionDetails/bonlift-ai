import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { outcomeBadgeVariant } from "../feedback";
import type { ServedItem } from "../type";
import { useFeedbackLabels } from "../use-feedback-labels";

// One served item: rank, item id and its feedback, an empty neutral badge when there is none. The reason is in the
// tooltip to keep the row short.
export function ServedItemBadge({ item }: { item: ServedItem }) {
  const { t } = useTranslation("recommendationFeedback");
  const { reasonLabel } = useFeedbackLabels();

  return (
    <span className="inline-flex items-center gap-1.5" title={reasonLabel(item.reason)}>
      <span className="text-xs text-muted-foreground tabular-nums">
        {t("serves.rank", { rank: item.rank })}
      </span>
      <span className="font-mono text-xs">{item.label}</span>
      <Badge variant={outcomeBadgeVariant(item.outcome)}>
        {item.outcome && t(`outcomes.${item.outcome}`)}
      </Badge>
    </span>
  );
}

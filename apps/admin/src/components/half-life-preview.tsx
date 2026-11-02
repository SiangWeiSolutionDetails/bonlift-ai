import { useTranslation } from "react-i18next";

const ORDER_AGES_IN_DAYS = [0, 7, 14, 30, 60, 90];

// Same formula as the score calculations in packages/worker/src/calculations
function getWeight(days: number, halfLifeDays: number | undefined) {
  if (!halfLifeDays || !Number.isInteger(halfLifeDays) || halfLifeDays < 1) {
    return null;
  }
  return 0.5 ** (days / halfLifeDays);
}

type HalfLifePreviewProps = {
  halfLifeDays: number | undefined;
};

export function HalfLifePreview({ halfLifeDays }: HalfLifePreviewProps) {
  const { t } = useTranslation("brands");

  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="font-medium">{t("halfLifePreview.title")}</div>
      {ORDER_AGES_IN_DAYS.map((days) => {
        const weight = getWeight(days, halfLifeDays);
        return (
          <div key={days} className="flex items-center gap-3">
            <span className="w-16 shrink-0 whitespace-nowrap text-muted-foreground tabular-nums">
              {t("halfLifePreview.days", { count: days })}
            </span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${(weight ?? 0) * 100}%` }}
              />
            </div>
            <span className="w-9 text-right tabular-nums">
              {weight === null ? "—" : weight.toFixed(2)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

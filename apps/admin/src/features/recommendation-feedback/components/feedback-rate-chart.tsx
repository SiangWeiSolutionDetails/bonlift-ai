import { useTranslation } from "react-i18next";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { dayTickInterval } from "@/features/brand-usage/days";
import { formatDate, formatShortDate } from "@/lib/date-format";
import { formatRate } from "../feedback";
import type { FeedbackDay } from "../type";

// A day with no outcome has a null rate: the line breaks there rather than dipping to 0% or bridging the gap.
export function FeedbackRateChart({ days }: { days: FeedbackDay[] }) {
  const { t, i18n } = useTranslation("recommendationFeedback");
  const config = {
    acceptanceRate: {
      label: t("summary.acceptanceRate"),
      // The theme's primary already switches between light and dark.
      color: "var(--primary)",
    },
  } satisfies ChartConfig;

  return (
    <ChartContainer config={config} className="aspect-auto h-40 w-full">
      <LineChart data={days} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          interval={dayTickInterval(days.length)}
          tickFormatter={formatShortDate}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={48}
          domain={[0, 1]}
          ticks={[0, 0.25, 0.5, 0.75, 1]}
          tickFormatter={(value: number) => formatRate(value, i18n.language)}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(label) => formatDate(String(label))}
              formatter={(value) => (
                <div className="flex flex-1 items-center justify-between gap-4 leading-none">
                  <span className="text-muted-foreground">{t("summary.acceptanceRate")}</span>
                  <span className="font-mono font-medium text-foreground tabular-nums">
                    {formatRate(value == null ? null : Number(value), i18n.language)}
                  </span>
                </div>
              )}
            />
          }
        />
        <Line
          dataKey="acceptanceRate"
          type="monotone"
          stroke="var(--color-acceptanceRate)"
          strokeWidth={2}
          dot={{ r: 2, fill: "var(--color-acceptanceRate)" }}
          connectNulls={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ChartContainer>
  );
}

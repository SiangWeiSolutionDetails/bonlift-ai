import { useTranslation } from "react-i18next";
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { dayTickInterval } from "@/features/brand-usage/days";
import { formatDate, formatShortDate } from "@/lib/date-format";
import { OUTCOMES, topOutcome } from "../feedback";
import type { FeedbackDay, ServedItemOutcome } from "../type";

// Tailwind green-500, red-500, zinc-400 and sky-500, the usage chart's greens and reds. The legend, tooltip and
// tables carry the values too, so the colour is never the only cue.
const COLORS: Record<ServedItemOutcome, { light: string; dark: string }> = {
  accepted: { light: "oklch(72.3% 0.219 149.579)", dark: "oklch(72.3% 0.219 149.579)" },
  rejected: { light: "oklch(63.7% 0.237 25.331)", dark: "oklch(63.7% 0.237 25.331)" },
  ignored: { light: "oklch(70.5% 0.015 286.067)", dark: "oklch(55.2% 0.016 285.938)" },
  awaiting: { light: "oklch(68.5% 0.169 237.323)", dark: "oklch(68.5% 0.169 237.323)" },
};

export function FeedbackOutcomesChart({ days }: { days: FeedbackDay[] }) {
  const { t } = useTranslation("recommendationFeedback");
  const config = Object.fromEntries(
    OUTCOMES.map((outcome) => [outcome, { label: t(`outcomes.${outcome}`), theme: COLORS[outcome] }]),
  ) satisfies ChartConfig;

  return (
    <ChartContainer config={config} className="aspect-auto h-60 w-full">
      <BarChart data={days} margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          interval={dayTickInterval(days.length)}
          tickFormatter={formatShortDate}
        />
        <YAxis tickLine={false} axisLine={false} width={40} allowDecimals={false} />
        <ChartTooltip
          cursor={{ fill: "var(--muted)", opacity: 0.5 }}
          content={<ChartTooltipContent labelFormatter={(label) => formatDate(String(label))} />}
        />
        {/* itemSorter null: the legend follows the stack order instead of the alphabet */}
        <ChartLegend content={<ChartLegendContent />} itemSorter={null} />
        {OUTCOMES.map((outcome) => (
          <Bar
            key={outcome}
            dataKey={outcome}
            stackId="outcomes"
            fill={`var(--color-${outcome})`}
            stroke="var(--card)"
            strokeWidth={2}
            maxBarSize={28}
          >
            {days.map((day) => (
              <Cell key={day.date} radius={topOutcome(day) === outcome ? ([4, 4, 0, 0] as any) : 0} />
            ))}
          </Bar>
        ))}
      </BarChart>
    </ChartContainer>
  );
}

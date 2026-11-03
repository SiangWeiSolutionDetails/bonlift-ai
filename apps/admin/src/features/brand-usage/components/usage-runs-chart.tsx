import { useTranslation } from "react-i18next";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatDate, formatShortDate } from "@/lib/date-format";
import { dayTickInterval } from "../days";
import type { BrandUsageDay } from "../type";

export function UsageRunsChart({ days }: { days: BrandUsageDay[] }) {
  const { t } = useTranslation("usage");
  const config = {
    calculationRuns: {
      label: t("counts.calculationRuns"),
      // The theme's primary already switches between light and dark.
      color: "var(--primary)",
    },
  } satisfies ChartConfig;

  return (
    <ChartContainer config={config} className="aspect-auto h-32 w-full">
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
        <Bar
          dataKey="calculationRuns"
          fill="var(--color-calculationRuns)"
          radius={[4, 4, 0, 0]}
          maxBarSize={28}
        />
      </BarChart>
    </ChartContainer>
  );
}

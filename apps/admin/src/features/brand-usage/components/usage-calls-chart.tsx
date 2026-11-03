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
import { formatDate, formatShortDate } from "@/lib/date-format";
import { dayTickInterval } from "../days";
import type { BrandUsageDay } from "../type";

// Bottom to top: Tailwind green-500, orange-500 and red-500 (chosen by product). Orange beside red and beside green
// is hard to tell apart (more so with colour blindness), so the surface gaps, legend, tooltip and table carry the
// values; never rely on the colour alone here.
const SERIES = [
  { key: "succeeded", light: "oklch(72.3% 0.219 149.579)", dark: "oklch(72.3% 0.219 149.579)" },
  { key: "clientErrors", light: "oklch(70.5% 0.213 47.604)", dark: "oklch(70.5% 0.213 47.604)" },
  { key: "serverErrors", light: "oklch(63.7% 0.237 25.331)", dark: "oklch(63.7% 0.237 25.331)" },
] as const;

type SeriesKey = (typeof SERIES)[number]["key"];

// Only the topmost visible segment gets the rounded end, so every bar has one whatever its mix.
function topSeries(day: BrandUsageDay): SeriesKey | undefined {
  return SERIES.findLast(({ key }) => day[key] > 0)?.key;
}

export function UsageCallsChart({ days }: { days: BrandUsageDay[] }) {
  const { t } = useTranslation("usage");
  const config = Object.fromEntries(
    SERIES.map(({ key, light, dark }) => [key, { label: t(`counts.${key}`), theme: { light, dark } }]),
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
        {SERIES.map(({ key }) => (
          <Bar
            key={key}
            dataKey={key}
            stackId="calls"
            fill={`var(--color-${key})`}
            stroke="var(--card)"
            strokeWidth={2}
            maxBarSize={28}
          >
            {days.map((day) => (
              <Cell key={day.date} radius={topSeries(day) === key ? ([4, 4, 0, 0] as any) : 0} />
            ))}
          </Bar>
        ))}
      </BarChart>
    </ChartContainer>
  );
}

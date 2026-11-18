import { subDays } from "date-fns";
import { useTranslation } from "react-i18next";
import { getRouteApi } from "@tanstack/react-router";
import { DatePicker } from "@/components/date-picker";
import { PageHeader } from "@/components/page-header";
import { Label } from "@/components/ui/label";
import { BrandUsageReport } from "@/features/brand-usage/components/brand-usage-report";
import { useWorkspaceBrandId } from "@/features/workspaces/use-workspace";
import { toIsoDate } from "@/lib/date-format";

const routeApi = getRouteApi("/_app/b/$brandId/usage");
const DEFAULT_RANGE_DAYS = 30;

function defaultRange() {
  const today = new Date();
  return { from: toIsoDate(subDays(today, DEFAULT_RANGE_DAYS - 1)), to: toIsoDate(today) };
}

export function UsagePage() {
  const { t } = useTranslation("usage");
  const brandId = useWorkspaceBrandId();
  const search = routeApi.useSearch();
  const navigate = routeApi.useNavigate();
  const range = search.from && search.to ? { from: search.from, to: search.to } : defaultRange();

  // replace: picking filters should not fill the back button history
  function setSearch(next: { from?: string; to?: string }) {
    navigate({ search: { ...range, ...next }, replace: true });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("page.title")} />

      <div className="flex flex-wrap items-center gap-3">
        <Label htmlFor="usage-from" className="shrink-0">
          {t("picker.from")}
        </Label>
        <div className="w-40">
          <DatePicker
            id="usage-from"
            value={range.from}
            // Moving from past to drags to along, so the range is never empty
            onChange={(from) => setSearch({ from, to: from > range.to ? from : range.to })}
          />
        </div>
        <Label htmlFor="usage-to" className="shrink-0">
          {t("picker.to")}
        </Label>
        <div className="w-40">
          <DatePicker
            id="usage-to"
            value={range.to}
            min={range.from}
            onChange={(to) => setSearch({ to })}
          />
        </div>
      </div>

      <BrandUsageReport brandId={brandId} from={range.from} to={range.to} />
    </div>
  );
}

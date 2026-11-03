import { subDays } from "date-fns";
import { useTranslation } from "react-i18next";
import { getRouteApi } from "@tanstack/react-router";
import { DatePicker } from "@/components/date-picker";
import { PageHeader } from "@/components/page-header";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBrands } from "@/features/brands/queries";
import { BrandUsageReport } from "@/features/brand-usage/components/brand-usage-report";
import { toIsoDate } from "@/lib/date-format";

const routeApi = getRouteApi("/usage");
const DEFAULT_RANGE_DAYS = 30;

function defaultRange() {
  const today = new Date();
  return { from: toIsoDate(subDays(today, DEFAULT_RANGE_DAYS - 1)), to: toIsoDate(today) };
}

export function UsagePage() {
  const { t } = useTranslation("usage");
  const search = routeApi.useSearch();
  const navigate = routeApi.useNavigate();
  const { data: brands = [] } = useBrands();
  const range = search.from && search.to ? { from: search.from, to: search.to } : defaultRange();

  // replace: picking filters should not fill the back button history
  function setSearch(next: { brandId?: string; from?: string; to?: string }) {
    navigate({ search: { brandId: search.brandId, ...range, ...next }, replace: true });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("page.title")} />

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-3">
          <Label htmlFor="usage-brand" className="shrink-0">
            {t("picker.brand")}
          </Label>
          <Select value={search.brandId ?? ""} onValueChange={(brandId) => setSearch({ brandId })}>
            <SelectTrigger id="usage-brand" className="w-56">
              <SelectValue placeholder={t("picker.brandPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {brands.map((brand) => (
                <SelectItem key={brand.id} value={brand.id}>
                  {brand.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-3">
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
      </div>

      {!search.brandId ? (
        <p className="rounded-2xl border border-dashed py-16 text-center text-sm text-muted-foreground">
          {t("picker.noBrand")}
        </p>
      ) : (
        <BrandUsageReport brandId={search.brandId} from={range.from} to={range.to} />
      )}
    </div>
  );
}

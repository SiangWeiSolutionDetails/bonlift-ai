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
import { FeedbackFilters } from "@/features/recommendation-feedback/components/feedback-filters";
import { RecommendationFeedbackReport } from "@/features/recommendation-feedback/components/recommendation-feedback-report";
import {
  MAX_RANGE_DAYS,
  daypartOptions,
  isRangeTooLong,
} from "@/features/recommendation-feedback/feedback";
import { useRecommendationFeedbackReport } from "@/features/recommendation-feedback/queries";
import type { RecommendationFeedbackSearch } from "@/features/recommendation-feedback/search";
import type { FeedbackFilters as Filters } from "@/features/recommendation-feedback/type";
import { toIsoDate } from "@/lib/date-format";

const routeApi = getRouteApi("/recommendation-feedback");
const DEFAULT_RANGE_DAYS = 30;

function defaultRange() {
  const today = new Date();
  return { from: toIsoDate(subDays(today, DEFAULT_RANGE_DAYS - 1)), to: toIsoDate(today) };
}

export function RecommendationFeedbackPage() {
  const { t } = useTranslation("recommendationFeedback");
  const search = routeApi.useSearch();
  const navigate = routeApi.useNavigate();
  const { data: brands = [] } = useBrands();
  const range = search.from && search.to ? { from: search.from, to: search.to } : defaultRange();
  const filters: Filters = {
    ...range,
    outletId: search.outletId,
    daypart: search.daypart,
    reason: search.reason,
    channelId: search.channelId,
  };
  const tooLong = isRangeTooLong(range.from, range.to);
  // Same query key as the report below, so the daypart options cost no extra request
  const { data: report } = useRecommendationFeedbackReport(
    search.brandId ?? "",
    filters,
    !!search.brandId && !tooLong,
  );
  const dayparts = daypartOptions(report?.byDaypart.map((row) => row.key) ?? [], search.daypart);

  // replace: picking filters should not fill the back button history
  function setSearch(next: RecommendationFeedbackSearch) {
    navigate({ search: { ...search, ...range, ...next }, replace: true });
  }

  // Outlets, channels and dayparts belong to the brand, so they reset with it
  function setBrand(brandId: string) {
    setSearch({ brandId, outletId: undefined, channelId: undefined, daypart: undefined });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("page.title")} />

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-3">
          <Label htmlFor="feedback-brand" className="shrink-0">
            {t("picker.brand")}
          </Label>
          <Select value={search.brandId ?? ""} onValueChange={setBrand}>
            <SelectTrigger id="feedback-brand" className="w-56">
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
          <Label htmlFor="feedback-from" className="shrink-0">
            {t("picker.from")}
          </Label>
          <div className="w-40">
            <DatePicker
              id="feedback-from"
              value={range.from}
              // Moving from past to drags to along, so the range is never empty
              onChange={(from) => setSearch({ from, to: from > range.to ? from : range.to })}
            />
          </div>
          <Label htmlFor="feedback-to" className="shrink-0">
            {t("picker.to")}
          </Label>
          <div className="w-40">
            <DatePicker
              id="feedback-to"
              value={range.to}
              min={range.from}
              onChange={(to) => setSearch({ to })}
            />
          </div>
        </div>
      </div>

      {search.brandId && (
        <FeedbackFilters
          brandId={search.brandId}
          values={filters}
          dayparts={dayparts}
          onChange={setSearch}
        />
      )}

      {!search.brandId ? (
        <p className="rounded-2xl border border-dashed py-16 text-center text-sm text-muted-foreground">
          {t("picker.noBrand")}
        </p>
      ) : tooLong ? (
        <p className="text-sm text-destructive">{t("picker.rangeTooLong", { max: MAX_RANGE_DAYS })}</p>
      ) : (
        <RecommendationFeedbackReport brandId={search.brandId} filters={filters} />
      )}
    </div>
  );
}

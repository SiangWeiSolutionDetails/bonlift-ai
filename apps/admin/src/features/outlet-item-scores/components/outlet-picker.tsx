import { useTranslation } from "react-i18next";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBrands } from "@/features/brands/queries";
import { useOutlets } from "@/features/outlets/queries";

type OutletPickerProps = {
  brandId: string | undefined;
  outletId: string | undefined;
  onBrandChange: (brandId: string) => void;
  onOutletChange: (outletId: string) => void;
};

export function OutletPicker({
  brandId,
  outletId,
  onBrandChange,
  onOutletChange,
}: OutletPickerProps) {
  const { t } = useTranslation("results");
  const { data: brands = [] } = useBrands();
  // Shares the outlets page's cache entry for the same brand
  const { data: outlets = [] } = useOutlets(brandId ? { brandId } : {});

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
      <div className="flex items-center gap-3">
        <Label htmlFor="results-brand" className="shrink-0">
          {t("picker.brand")}
        </Label>
        <Select value={brandId ?? ""} onValueChange={onBrandChange}>
          <SelectTrigger id="results-brand" className="w-56">
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
        <Label htmlFor="results-outlet" className="shrink-0">
          {t("picker.outlet")}
        </Label>
        <Select
          value={outletId ?? ""}
          onValueChange={onOutletChange}
          disabled={!brandId}
        >
          <SelectTrigger id="results-outlet" className="w-56">
            <SelectValue placeholder={t("picker.outletPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            {brandId &&
              outlets.map((outlet) => (
                <SelectItem key={outlet.id} value={outlet.id}>
                  {outlet.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

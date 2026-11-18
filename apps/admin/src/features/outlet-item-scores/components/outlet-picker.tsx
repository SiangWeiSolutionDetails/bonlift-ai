import { useTranslation } from "react-i18next";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useOutlets } from "@/features/outlets/queries";

type OutletPickerProps = {
  brandId: string;
  outletId: string | undefined;
  onOutletChange: (outletId: string) => void;
};

export function OutletPicker({ brandId, outletId, onOutletChange }: OutletPickerProps) {
  const { t } = useTranslation("results");
  // Shares the outlets page's cache entry for the same brand
  const { data: outlets = [] } = useOutlets({ brandId });

  return (
    <div className="flex items-center gap-3">
      <Label htmlFor="results-outlet" className="shrink-0">
        {t("picker.outlet")}
      </Label>
      <Select value={outletId ?? ""} onValueChange={onOutletChange}>
        <SelectTrigger id="results-outlet" className="w-56">
          <SelectValue placeholder={t("picker.outletPlaceholder")} />
        </SelectTrigger>
        <SelectContent>
          {outlets.map((outlet) => (
            <SelectItem key={outlet.id} value={outlet.id}>
              {outlet.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

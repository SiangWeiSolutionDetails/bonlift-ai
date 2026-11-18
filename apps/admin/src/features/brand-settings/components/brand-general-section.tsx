import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCurrentWorkspace } from "@/features/workspaces/use-workspace";

// Read from me.brands: a brand-only user may not be allowed to list brands
export function BrandGeneralSection() {
  const { t } = useTranslation("brands");
  const workspace = useCurrentWorkspace();
  const brand = workspace?.kind === "brand" ? workspace : null;

  return (
    <div className="grid content-start gap-6">
      <div className="grid gap-2">
        <Label htmlFor="brand-tenant">{t("edit.tenant")}</Label>
        <Input id="brand-tenant" readOnly value={brand?.tenantName ?? "—"} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="brand-name">{t("edit.name")}</Label>
        <Input id="brand-name" readOnly value={brand?.brandName ?? "—"} />
      </div>
    </div>
  );
}

import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getRouteApi } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BrandApiKeysTable } from "@/features/brand-api-keys/components/brand-api-keys-table";
import { CreateApiKeyDialog } from "@/features/brand-api-keys/components/create-api-key-dialog";
import { useBrands } from "@/features/brands/queries";

const routeApi = getRouteApi("/brand-api-keys");

export function ApiKeysPage() {
  const { t } = useTranslation("apiKeys");
  const search = routeApi.useSearch();
  const navigate = routeApi.useNavigate();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const { data: brands = [] } = useBrands();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("page.title")}
        action={
          <Button disabled={!search.brandId} onClick={() => setIsCreateDialogOpen(true)}>
            <PlusIcon data-icon="inline-start" />
            {t("list.create")}
          </Button>
        }
      />

      <div className="flex items-center gap-3">
        <Label htmlFor="api-keys-brand" className="shrink-0">
          {t("picker.brand")}
        </Label>
        <Select
          value={search.brandId ?? ""}
          // replace: picking a brand should not fill the back button history
          onValueChange={(brandId) => navigate({ search: { brandId }, replace: true })}
        >
          <SelectTrigger id="api-keys-brand" className="w-56">
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

      {!search.brandId ? (
        <p className="rounded-2xl border border-dashed py-16 text-center text-sm text-muted-foreground">
          {t("picker.noBrand")}
        </p>
      ) : (
        <>
          <BrandApiKeysTable brandId={search.brandId} />
          {/* key: a brand switch while the dialog is closed starts the next create from an empty form */}
          <CreateApiKeyDialog
            key={search.brandId}
            brandId={search.brandId}
            open={isCreateDialogOpen}
            onClose={() => setIsCreateDialogOpen(false)}
          />
        </>
      )}
    </div>
  );
}

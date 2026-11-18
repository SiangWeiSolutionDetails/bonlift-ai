import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { BrandApiKeysTable } from "@/features/brand-api-keys/components/brand-api-keys-table";
import { CreateApiKeyDialog } from "@/features/brand-api-keys/components/create-api-key-dialog";
import { usePermissions } from "@/features/auth/permissions";
import { useWorkspaceBrandId } from "@/features/workspaces/use-workspace";

export function ApiKeysPage() {
  const { t } = useTranslation("apiKeys");
  const brandId = useWorkspaceBrandId();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const { canBrand } = usePermissions();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("page.title")}
        action={
          canBrand(brandId, "apiKeys.create") && (
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <PlusIcon data-icon="inline-start" />
              {t("list.create")}
            </Button>
          )
        }
      />

      <BrandApiKeysTable brandId={brandId} />
      <CreateApiKeyDialog
        brandId={brandId}
        open={isCreateDialogOpen}
        onClose={() => setIsCreateDialogOpen(false)}
      />
    </div>
  );
}

import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/features/auth/permissions";
import { AddBrandUserDialog } from "@/features/brand-users/components/add-brand-user-dialog";
import { BrandUsersSection } from "@/features/brand-users/components/brand-users-section";
import { useWorkspaceBrandId } from "@/features/workspaces/use-workspace";

export function BrandUsersPage() {
  const { t } = useTranslation();
  const { t: tBrands } = useTranslation("brands");
  const brandId = useWorkspaceBrandId();
  const { canBrand } = usePermissions();
  const [addOpen, setAddOpen] = useState(false);
  const canManage = canBrand(brandId, "brandUsers.manage");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("nav.brandUsers")}
        action={
          canManage && (
            <Button onClick={() => setAddOpen(true)}>
              <PlusIcon data-icon="inline-start" />
              {tBrands("users.newUser")}
            </Button>
          )
        }
      />
      <BrandUsersSection brandId={brandId} readOnly={!canManage} />
      {canManage && <AddBrandUserDialog brandId={brandId} open={addOpen} onOpenChange={setAddOpen} />}
    </div>
  );
}

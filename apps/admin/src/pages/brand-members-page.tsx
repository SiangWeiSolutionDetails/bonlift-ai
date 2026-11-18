import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/features/auth/permissions";
import { AddMemberDialog } from "@/features/brand-members/components/add-member-dialog";
import { BrandMembersSection } from "@/features/brand-members/components/brand-members-section";
import { useWorkspaceBrandId } from "@/features/workspaces/use-workspace";

export function BrandMembersPage() {
  const { t } = useTranslation();
  const { t: tBrands } = useTranslation("brands");
  const brandId = useWorkspaceBrandId();
  const { canBrand } = usePermissions();
  const [addOpen, setAddOpen] = useState(false);
  const canManage = canBrand(brandId, "members.manage");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("nav.members")}
        action={
          canManage && (
            <Button onClick={() => setAddOpen(true)}>
              <PlusIcon data-icon="inline-start" />
              {tBrands("members.newUser")}
            </Button>
          )
        }
      />
      <p className="text-sm text-muted-foreground">{tBrands("members.description")}</p>
      <BrandMembersSection brandId={brandId} readOnly={!canManage} />
      {canManage && <AddMemberDialog brandId={brandId} open={addOpen} onOpenChange={setAddOpen} />}
    </div>
  );
}

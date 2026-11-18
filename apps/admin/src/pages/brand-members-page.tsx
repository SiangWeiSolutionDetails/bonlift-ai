import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/page-header";
import { usePermissions } from "@/features/auth/permissions";
import { BrandMembersSection } from "@/features/brand-members/components/brand-members-section";
import { useWorkspaceBrandId } from "@/features/workspaces/use-workspace";

export function BrandMembersPage() {
  const { t } = useTranslation();
  const brandId = useWorkspaceBrandId();
  const { canBrand } = usePermissions();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("nav.members")} />
      {/* p-6 matches the -mx-6 overhang the section's scroll body was built for in the dialog */}
      <div className="flex flex-col rounded-xl bg-card p-6 shadow-panel">
        <BrandMembersSection brandId={brandId} readOnly={!canBrand(brandId, "members.manage")} />
      </div>
    </div>
  );
}

import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { CreateTenantDialog } from "@/features/tenants/components/create-tenant-dialog";
import { TenantDialog } from "@/features/tenants/components/tenant-dialog";
import { TenantsTable } from "@/features/tenants/components/tenants-table";
import type { Tenant } from "@/features/tenants/type";
import { useTenants } from "@/features/tenants/queries";

export function TenantsPage() {
  const { t } = useTranslation("tenants");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  // Not reset on close, so the title doesn't flip while the dialog animates out
  const [isReadOnly, setIsReadOnly] = useState(false);

  function openTenant(tenant: Tenant, readOnly: boolean) {
    setSelectedTenant(tenant);
    setIsReadOnly(readOnly);
  }

  const { data: tenants, error, isPending } = useTenants();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("page.title")}
        description={t("page.description")}
        action={
          <Button onClick={() => setIsCreateOpen(true)}>
            <PlusIcon data-icon="inline-start" />
            {t("page.newTenant")}
          </Button>
        }
      />

      <TenantsTable
        tenants={tenants}
        isPending={isPending}
        error={error}
        onEdit={(tenant) => openTenant(tenant, false)}
        onView={(tenant) => openTenant(tenant, true)}
      />

      <CreateTenantDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />
      <TenantDialog
        tenant={selectedTenant}
        readOnly={isReadOnly}
        onClose={() => setSelectedTenant(null)}
      />
    </div>
  );
}

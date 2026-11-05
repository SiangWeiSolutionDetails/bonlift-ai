import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { CreateTenantDialog } from "@/features/tenants/components/create-tenant-dialog";
import { TenantDialog } from "@/features/tenants/components/tenant-dialog";
import { TenantsTable } from "@/features/tenants/components/tenants-table";
import type { Tenant } from "@/features/tenants/type";
import { useDeleteTenant, useTenants } from "@/features/tenants/queries";
import { getErrorMessage } from "@/lib/error-message";

export function TenantsPage() {
  const { t } = useTranslation("tenants");
  const { t: tCommon } = useTranslation();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [tenantToDelete, setTenantToDelete] = useState<Tenant | null>(null);
  const deleteTenantMutation = useDeleteTenant();
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
        action={
          <Button onClick={() => setIsCreateOpen(true)}>
            <PlusIcon data-icon="inline-start" />
            {t("page.newTenant")}
          </Button>
        }
      />

      {deleteTenantMutation.error && (
        <p className="text-sm text-destructive">
          {getErrorMessage(deleteTenantMutation.error, tCommon)}
        </p>
      )}

      <TenantsTable
        tenants={tenants}
        isPending={isPending}
        error={error}
        onEdit={(tenant) => openTenant(tenant, false)}
        onView={(tenant) => openTenant(tenant, true)}
        onDelete={setTenantToDelete}
      />

      <ConfirmDialog
        open={tenantToDelete !== null}
        title={t("delete.title", { name: tenantToDelete?.name })}
        description={t("delete.description")}
        confirmLabel={tCommon("actions.delete")}
        confirmMatch={tenantToDelete?.name}
        onCancel={() => setTenantToDelete(null)}
        onConfirm={() =>
          tenantToDelete && deleteTenantMutation.mutate(tenantToDelete.id)
        }
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

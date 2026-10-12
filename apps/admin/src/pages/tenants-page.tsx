import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { CreateTenantDialog } from "@/features/tenants/components/create-tenant-dialog";
import { EditTenantDialog } from "@/features/tenants/components/edit-tenant-dialog";
import { TenantsTable } from "@/features/tenants/components/tenants-table";
import type { Tenant } from "@/features/tenants/type";

export function TenantsPage() {
  const { t } = useTranslation("tenants");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);

  // IMPLEMENT: replace these three with `useTenants()`.
  const tenants: Tenant[] | undefined = [];
  const isPending = false;
  const error = null as Error | null;

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
        onEdit={setEditingTenant}
      />

      <CreateTenantDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />
      <EditTenantDialog
        tenant={editingTenant}
        onClose={() => setEditingTenant(null)}
      />
    </div>
  );
}

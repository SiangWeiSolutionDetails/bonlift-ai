import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
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
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("page.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("page.description")}</p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}>
          <PlusIcon data-icon="inline-start" />
          {t("page.newTenant")}
        </Button>
      </div>

      <TenantsTable
        tenants={tenants}
        isPending={isPending}
        error={error}
        onEdit={setEditingTenant}
      />

      <CreateTenantDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />
      <EditTenantDialog tenant={editingTenant} onClose={() => setEditingTenant(null)} />
    </div>
  );
}

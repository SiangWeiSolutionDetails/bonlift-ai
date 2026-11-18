import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePermissions } from "@/features/auth/permissions";
import { CreateOutletDialog } from "@/features/outlets/components/create-outlet-dialog";
import { OutletDialog } from "@/features/outlets/components/outlet-dialog";
import { OutletsTable } from "@/features/outlets/components/outlets-table";
import { useDeleteOutlet, useOutlets } from "@/features/outlets/queries";
import { useWorkspaceBrandId } from "@/features/workspaces/use-workspace";
import type { Outlet } from "@/features/outlets/type";
import { getErrorMessage } from "@/lib/error-message";
import { filterByName } from "@/lib/filter-by-name";

export function OutletsPage() {
  const { t } = useTranslation("outlets");
  const { t: tCommon } = useTranslation();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedOutlet, setSelectedOutlet] = useState<Outlet | null>(null);
  const [outletToDelete, setOutletToDelete] = useState<Outlet | null>(null);
  const deleteOutletMutation = useDeleteOutlet();
  const { canBrand } = usePermissions();
  // Not reset on close, so the title doesn't flip while the dialog animates out
  const [isReadOnly, setIsReadOnly] = useState(false);
  const brandId = useWorkspaceBrandId();
  const [searchText, setSearchText] = useState("");
  const canCreate = canBrand(brandId, "outlets.create");
  const canEdit = canBrand(brandId, "outlets.edit");
  const canDelete = canBrand(brandId, "outlets.delete");

  function openOutlet(outlet: Outlet, readOnly: boolean) {
    setSelectedOutlet(outlet);
    setIsReadOnly(readOnly);
  }

  const { data: outlets, isPending, error } = useOutlets({ brandId });
  const filteredOutlets = filterByName(outlets, searchText);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("page.title")}
        action={
          canCreate && (
            <Button onClick={() => setIsCreateOpen(true)}>
              <PlusIcon data-icon="inline-start" />
              {t("page.newOutlet")}
            </Button>
          )
        }
      />

      <Input
        type="search"
        className="w-72"
        aria-label={t("search.placeholder")}
        placeholder={t("search.placeholder")}
        value={searchText}
        onChange={(event) => setSearchText(event.target.value)}
      />

      {deleteOutletMutation.error && (
        <p className="text-sm text-destructive">
          {getErrorMessage(deleteOutletMutation.error, tCommon)}
        </p>
      )}

      <OutletsTable
        outlets={filteredOutlets}
        emptyMessage={searchText.trim() ? t("search.noMatches") : undefined}
        isPending={isPending}
        error={error}
        canEdit={canEdit}
        canDelete={canDelete}
        onEdit={(outlet) => openOutlet(outlet, false)}
        onView={(outlet) => openOutlet(outlet, true)}
        onDelete={setOutletToDelete}
      />

      <ConfirmDialog
        open={outletToDelete !== null}
        title={t("delete.title", { name: outletToDelete?.name })}
        description={t("delete.description")}
        confirmLabel={tCommon("actions.delete")}
        confirmMatch={outletToDelete?.name}
        onCancel={() => setOutletToDelete(null)}
        onConfirm={() =>
          outletToDelete && deleteOutletMutation.mutate(outletToDelete.id)
        }
      />

      <CreateOutletDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} brandId={brandId} />
      <OutletDialog
        outlet={selectedOutlet}
        readOnly={isReadOnly}
        onClose={() => setSelectedOutlet(null)}
      />
    </div>
  );
}

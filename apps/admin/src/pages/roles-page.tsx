import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePermissions } from "@/features/auth/permissions";
import { useCurrentUser } from "@/features/auth/queries";
import { RoleDialog, type RoleDialogTarget } from "@/features/roles/components/role-dialog";
import { RolesTable } from "@/features/roles/components/roles-table";
import { useDeleteRole, useRoles } from "@/features/roles/queries";
import type { Role, RoleKindType } from "@/features/roles/type";
import { getErrorMessage } from "@/lib/error-message";
import { filterByName } from "@/lib/filter-by-name";

function useHeldRoleIds() {
  const me = useCurrentUser();
  return new Set([
    ...(me.console ? [me.console.roleId] : []),
    ...me.brands.map((brand) => brand.roleId),
  ]);
}

export function RolesPage() {
  const { t } = useTranslation("roles");
  const { t: tCommon } = useTranslation();
  const { canConsole } = usePermissions();
  const canManage = canConsole("roles.manage");
  const heldRoleIds = useHeldRoleIds();
  const [kind, setKind] = useState<RoleKindType>("console");
  const [dialogTarget, setDialogTarget] = useState<RoleDialogTarget | null>(null);
  const [roleToDelete, setRoleToDelete] = useState<Role | null>(null);
  // Not cleared on close, so the title doesn't lose the name while the dialog animates out
  const [deleteTitleName, setDeleteTitleName] = useState("");
  const [searchText, setSearchText] = useState("");
  const { data: roles, error, isPending } = useRoles(kind);
  const filteredRoles = filterByName(roles, searchText);
  const deleteMutation = useDeleteRole();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("page.title")}
        action={
          canManage && (
            <Button onClick={() => setDialogTarget({ mode: "create", kind })}>
              <PlusIcon data-icon="inline-start" />
              {t(kind === "console" ? "page.newConsoleRole" : "page.newBrandRole")}
            </Button>
          )
        }
      />

      <Tabs
        value={kind}
        onValueChange={(value) => {
          deleteMutation.reset();
          setKind(value as RoleKindType);
        }}
      >
        <TabsList variant="line" className="justify-start">
          <TabsTrigger value="console" className="flex-none">
            {t("tabs.console")}
          </TabsTrigger>
          <TabsTrigger value="brand" className="flex-none">
            {t("tabs.brand")}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <p className="-mt-3 text-sm text-muted-foreground">
        {t(kind === "console" ? "page.consoleHint" : "page.brandHint")}
      </p>

      <Input
        type="search"
        className="w-72"
        aria-label={t("search.placeholder")}
        placeholder={t("search.placeholder")}
        value={searchText}
        onChange={(event) => setSearchText(event.target.value)}
      />

      {deleteMutation.error && (
        <p className="text-sm text-destructive">{getErrorMessage(deleteMutation.error, tCommon)}</p>
      )}

      <RolesTable
        roles={filteredRoles}
        emptyMessage={
          searchText.trim() ? t("search.noMatches", { text: searchText.trim() }) : undefined
        }
        isPending={isPending}
        error={error}
        heldRoleIds={heldRoleIds}
        onEdit={canManage ? (role) => setDialogTarget({ mode: "edit", role }) : undefined}
        onView={(role) => setDialogTarget({ mode: "view", role })}
        onDelete={
          canManage
            ? (role) => {
                deleteMutation.reset();
                setDeleteTitleName(role.name);
                setRoleToDelete(role);
              }
            : undefined
        }
      />

      <ConfirmDialog
        open={roleToDelete !== null}
        title={t("delete.title", { name: deleteTitleName })}
        description={t("delete.description")}
        confirmLabel={tCommon("actions.delete")}
        confirmMatch={roleToDelete?.name}
        onCancel={() => setRoleToDelete(null)}
        onConfirm={() => roleToDelete && deleteMutation.mutate(roleToDelete.id)}
      />

      <RoleDialog target={dialogTarget} onClose={() => setDialogTarget(null)} />
    </div>
  );
}

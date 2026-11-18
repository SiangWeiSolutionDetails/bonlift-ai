import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCurrentUser } from "@/features/auth/queries";
import { getErrorMessage } from "@/lib/error-message";
import { filterByName } from "@/lib/filter-by-name";
import { useDeleteRole, useRoles } from "../queries";
import { grantLimit } from "../role-access";
import type { Role, RoleScope } from "../type";
import { RoleDialog, type RoleDialogTarget } from "./role-dialog";
import { RolesTable } from "./roles-table";

function useHeldRoleIds() {
  const me = useCurrentUser();
  return new Set([
    ...(me.console ? [me.console.roleId] : []),
    ...me.brands.map((brand) => brand.roleId),
  ]);
}

type RolesViewProps = {
  scope: RoleScope;
  canManage: boolean;
};

export function RolesView({ scope, canManage }: RolesViewProps) {
  const { t } = useTranslation("roles");
  const { t: tCommon } = useTranslation();
  const me = useCurrentUser();
  const heldRoleIds = useHeldRoleIds();
  const isConsole = scope.kind === "console";
  const [dialogTarget, setDialogTarget] = useState<RoleDialogTarget | null>(null);
  const [roleToDelete, setRoleToDelete] = useState<Role | null>(null);
  // Not cleared on close, so the title doesn't lose the name while the dialog animates out
  const [deleteTitleName, setDeleteTitleName] = useState("");
  const [searchText, setSearchText] = useState("");
  const { data: roles, error, isPending } = useRoles(scope);
  const filteredRoles = filterByName(roles, searchText);
  const deleteMutation = useDeleteRole(scope);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("page.title")}
        action={
          canManage && (
            <Button onClick={() => setDialogTarget({ mode: "create" })}>
              <PlusIcon data-icon="inline-start" />
              {t(isConsole ? "page.newConsoleRole" : "page.newBrandRole")}
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
        grantLimit={grantLimit(me, scope)}
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

      <RoleDialog scope={scope} target={dialogTarget} onClose={() => setDialogTarget(null)} />
    </div>
  );
}

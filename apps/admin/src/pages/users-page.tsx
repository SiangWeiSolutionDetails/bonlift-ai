import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePermissions } from "@/features/auth/permissions";
import { useCurrentUser } from "@/features/auth/queries";
import { filterUsers } from "@/features/users/filter-users";
import { InviteUserDialog } from "@/features/users/components/invite-user-dialog";
import { UserEditDialog } from "@/features/users/components/user-edit-dialog";
import { UsersTable } from "@/features/users/components/users-table";
import {
  useDeleteUser,
  useDisableUser,
  useReinviteUser,
  useUsers,
} from "@/features/users/queries";
import type { UserRecord } from "@/features/users/type";
import { getErrorMessage } from "@/lib/error-message";

export function UsersPage() {
  const { t } = useTranslation("users");
  const { t: tCommon } = useTranslation();
  const me = useCurrentUser();
  const { canConsole } = usePermissions();
  const canInvite = canConsole("users.invite");
  const canOpenInvite =
    canInvite && (canConsole("users.assignConsoleRoles") || canConsole("users.assignBrandRoles"));
  const canEdit =
    canConsole("users.edit") ||
    canConsole("users.assignConsoleRoles") ||
    canConsole("users.assignBrandRoles");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [userToDisable, setUserToDisable] = useState<UserRecord | null>(null);
  // Not cleared on close, so the title doesn't lose the email while the dialog animates out
  const [disableTitleEmail, setDisableTitleEmail] = useState("");
  const [userToReinvite, setUserToReinvite] = useState<UserRecord | null>(null);
  const [reinviteTitleEmail, setReinviteTitleEmail] = useState("");
  const [userToDelete, setUserToDelete] = useState<UserRecord | null>(null);
  const [deleteTitleEmail, setDeleteTitleEmail] = useState("");
  const [userToEdit, setUserToEdit] = useState<UserRecord | null>(null);
  const [searchText, setSearchText] = useState("");
  const { data: users, error, isPending } = useUsers();
  const filteredUsers = filterUsers(users, searchText);
  const reinviteMutation = useReinviteUser();
  const disableMutation = useDisableUser();
  const deleteMutation = useDeleteUser();
  const shownError = reinviteMutation.error ?? disableMutation.error ?? deleteMutation.error;

  function clearErrors() {
    reinviteMutation.reset();
    disableMutation.reset();
    deleteMutation.reset();
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("page.title")}
        action={
          canOpenInvite && (
            <Button onClick={() => setInviteOpen(true)}>
              <PlusIcon data-icon="inline-start" />
              {t("page.invite")}
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

      {shownError && (
        <p className="text-sm text-destructive">{getErrorMessage(shownError, tCommon)}</p>
      )}

      <UsersTable
        users={filteredUsers}
        emptyMessage={
          searchText.trim() ? t("search.noMatches", { text: searchText.trim() }) : undefined
        }
        isPending={isPending}
        error={error}
        currentUserId={me.id}
        currentUserIsAdmin={me.console?.isAdmin ?? false}
        canInvite={canInvite}
        canDisable={canConsole("users.disable")}
        canDelete={canConsole("users.delete")}
        canEdit={canEdit}
        isBusy={
          reinviteMutation.isPending || disableMutation.isPending || deleteMutation.isPending
        }
        onEdit={setUserToEdit}
        onReinvite={(user) => {
          clearErrors();
          setReinviteTitleEmail(user.email);
          setUserToReinvite(user);
        }}
        onDisable={(user) => {
          clearErrors();
          setDisableTitleEmail(user.email);
          setUserToDisable(user);
        }}
        onDelete={(user) => {
          clearErrors();
          setDeleteTitleEmail(user.email);
          setUserToDelete(user);
        }}
      />

      <ConfirmDialog
        open={userToReinvite !== null}
        title={t("reinviteConfirm.title", { email: reinviteTitleEmail })}
        description={t("reinviteConfirm.description")}
        confirmLabel={t("table.reinvite")}
        onCancel={() => setUserToReinvite(null)}
        onConfirm={() => {
          if (userToReinvite && !reinviteMutation.isPending) {
            reinviteMutation.mutate(userToReinvite.id);
          }
          setUserToReinvite(null);
        }}
      />

      <ConfirmDialog
        open={userToDisable !== null}
        title={t("disable.title", { email: disableTitleEmail })}
        description={t("disable.description")}
        confirmLabel={t("table.disable")}
        confirmMatch={userToDisable?.email}
        onCancel={() => setUserToDisable(null)}
        onConfirm={() => {
          if (userToDisable && !disableMutation.isPending) disableMutation.mutate(userToDisable.id);
          setUserToDisable(null);
        }}
      />

      <ConfirmDialog
        open={userToDelete !== null}
        title={t("delete.title", { email: deleteTitleEmail })}
        description={t("delete.description")}
        confirmLabel={t("table.delete")}
        confirmMatch={userToDelete?.email}
        onCancel={() => setUserToDelete(null)}
        onConfirm={() => {
          if (userToDelete && !deleteMutation.isPending) deleteMutation.mutate(userToDelete.id);
          setUserToDelete(null);
        }}
      />

      <InviteUserDialog open={inviteOpen} onClose={() => setInviteOpen(false)} />

      <UserEditDialog user={userToEdit} onClose={() => setUserToEdit(null)} />
    </div>
  );
}

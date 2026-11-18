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
import { useDeleteUser, useUsers } from "@/features/users/queries";
import type { UserRecord } from "@/features/users/type";
import { getErrorMessage } from "@/lib/error-message";

export function UsersPage() {
  const { t } = useTranslation("users");
  const { t: tCommon } = useTranslation();
  const me = useCurrentUser();
  const { canConsole } = usePermissions();
  const canOpenInvite =
    canConsole("users.invite") && (canConsole("users.assignConsoleRoles") || canConsole("users.assignBrandRoles"));
  const canEdit =
    canConsole("users.edit") ||
    canConsole("users.assignConsoleRoles") ||
    canConsole("users.assignBrandRoles");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<UserRecord | null>(null);
  const [deleteTitleEmail, setDeleteTitleEmail] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserRecord | null>(null);
  // Not reset on close, so the dialog doesn't flip modes while it animates out
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [searchText, setSearchText] = useState("");
  const { data: users, error, isPending } = useUsers();
  const filteredUsers = filterUsers(users, searchText);
  const deleteMutation = useDeleteUser();

  function openUser(user: UserRecord, readOnly: boolean) {
    setSelectedUser(user);
    setIsReadOnly(readOnly);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("page.title")}
        action={
          canOpenInvite && (
            <Button onClick={() => setInviteOpen(true)}>
              <PlusIcon data-icon="inline-start" />
              {t("page.newUser")}
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

      <UsersTable
        users={filteredUsers}
        emptyMessage={
          searchText.trim() ? t("search.noMatches", { text: searchText.trim() }) : undefined
        }
        isPending={isPending}
        error={error}
        currentUserId={me.id}
        currentUserIsAdmin={me.console?.isAdmin ?? false}
        isBusy={deleteMutation.isPending}
        onView={(user) => openUser(user, true)}
        onEdit={canEdit ? (user) => openUser(user, false) : undefined}
        onDelete={
          canConsole("users.delete")
            ? (user) => {
                deleteMutation.reset();
                setDeleteTitleEmail(user.email);
                setUserToDelete(user);
              }
            : undefined
        }
      />

      <ConfirmDialog
        open={userToDelete !== null}
        title={t("delete.title", { email: deleteTitleEmail })}
        description={t("delete.description")}
        confirmLabel={tCommon("actions.delete")}
        confirmMatch={userToDelete?.email}
        onCancel={() => setUserToDelete(null)}
        onConfirm={() => {
          if (userToDelete && !deleteMutation.isPending) deleteMutation.mutate(userToDelete.id);
          setUserToDelete(null);
        }}
      />

      <InviteUserDialog open={inviteOpen} onClose={() => setInviteOpen(false)} />

      <UserEditDialog
        user={selectedUser}
        readOnly={isReadOnly}
        onClose={() => setSelectedUser(null)}
      />
    </div>
  );
}

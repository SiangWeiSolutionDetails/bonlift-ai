import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/features/auth/permissions";
import { useCurrentUser } from "@/features/auth/queries";
import { BrandRolesSheet } from "@/features/users/components/brand-roles-sheet";
import { InviteUserDialog } from "@/features/users/components/invite-user-dialog";
import { UsersTable } from "@/features/users/components/users-table";
import { useDisableUser, useReinviteUser, useUsers } from "@/features/users/queries";
import type { UserRecord } from "@/features/users/type";
import { getErrorMessage } from "@/lib/error-message";

export function UsersPage() {
  const { t } = useTranslation("users");
  const { t: tCommon } = useTranslation();
  const me = useCurrentUser();
  const { canConsole } = usePermissions();
  const canInvite = canConsole("users.invite");
  const canAssignBrandRoles = canConsole("users.assignBrandRoles");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [userToDisable, setUserToDisable] = useState<UserRecord | null>(null);
  // Not cleared on close, so the title doesn't lose the email while the dialog animates out
  const [disableTitleEmail, setDisableTitleEmail] = useState("");
  const [brandRolesUser, setBrandRolesUser] = useState<UserRecord | null>(null);
  const [actionError, setActionError] = useState<Error | null>(null);
  const { data: users, error, isPending } = useUsers();
  const reinviteMutation = useReinviteUser();
  const disableMutation = useDisableUser();
  const shownError = actionError ?? reinviteMutation.error ?? disableMutation.error;

  function clearErrors() {
    setActionError(null);
    reinviteMutation.reset();
    disableMutation.reset();
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("page.title")}
        action={
          canInvite && (
            <Button onClick={() => setInviteOpen(true)}>
              <PlusIcon data-icon="inline-start" />
              {t("page.invite")}
            </Button>
          )
        }
      />

      {shownError && (
        <p className="text-sm text-destructive">{getErrorMessage(shownError, tCommon)}</p>
      )}

      <UsersTable
        users={users}
        isPending={isPending}
        error={error}
        currentUserId={me.id}
        currentUserIsAdmin={me.console?.isAdmin ?? false}
        canInvite={canInvite}
        canDisable={canConsole("users.disable")}
        canAssignConsoleRole={canConsole("users.assignConsoleRoles")}
        onReinvite={(user) => {
          clearErrors();
          reinviteMutation.mutate(user.id);
        }}
        onDisable={(user) => {
          clearErrors();
          setDisableTitleEmail(user.email);
          setUserToDisable(user);
        }}
        onBrandRoles={setBrandRolesUser}
        onActionError={(actionErr) => {
          clearErrors();
          setActionError(actionErr);
        }}
      />

      <ConfirmDialog
        open={userToDisable !== null}
        title={t("disable.title", { email: disableTitleEmail })}
        description={t("disable.description")}
        confirmLabel={t("table.disable")}
        onCancel={() => setUserToDisable(null)}
        onConfirm={() => {
          if (userToDisable) disableMutation.mutate(userToDisable.id);
          setUserToDisable(null);
        }}
      />

      <InviteUserDialog open={inviteOpen} onClose={() => setInviteOpen(false)} />

      <BrandRolesSheet
        user={brandRolesUser}
        canEdit={canAssignBrandRoles && brandRolesUser?.id.toLowerCase() !== me.id.toLowerCase()}
        onClose={() => setBrandRolesUser(null)}
      />
    </div>
  );
}

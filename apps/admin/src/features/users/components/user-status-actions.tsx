import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/features/auth/permissions";
import { useCurrentUser } from "@/features/auth/queries";
import { getErrorMessage } from "@/lib/error-message";
import { useDisableUser, useReinviteUser } from "../queries";
import type { UserRecord } from "../type";

type UserStatusActionsProps = {
  user: UserRecord;
  disabled: boolean;
  onDone: () => void;
};

export function UserStatusActions({ user, disabled, onDone }: UserStatusActionsProps) {
  const { t } = useTranslation("users");
  const { t: tCommon } = useTranslation();
  const me = useCurrentUser();
  const { canConsole } = usePermissions();
  const disableMutation = useDisableUser();
  const reinviteMutation = useReinviteUser();
  const [confirming, setConfirming] = useState<"disable" | "reinvite" | null>(null);

  const isSelf = user.id.toLowerCase() === me.id.toLowerCase();
  const isLocked = isSelf || (!!user.consoleRole?.isBuiltin && !(me.console?.isAdmin ?? false));
  const isBusy = disabled || disableMutation.isPending || reinviteMutation.isPending;
  const isUserDisabled = user.status === "disabled";
  const showDisable = !isUserDisabled && canConsole("users.disable");
  const showReinvite = isUserDisabled && canConsole("users.invite");
  const error = disableMutation.error ?? reinviteMutation.error;

  function open(action: "disable" | "reinvite") {
    disableMutation.reset();
    reinviteMutation.reset();
    setConfirming(action);
  }

  function confirm() {
    const mutation = confirming === "disable" ? disableMutation : reinviteMutation;
    setConfirming(null);
    if (!mutation.isPending) mutation.mutate(user.id, { onSuccess: onDone });
  }

  if (!showDisable && !showReinvite) return null;

  return (
    <div className="flex flex-col gap-2 sm:mr-auto">
      {showDisable && (
        <Button
          type="button"
          variant="ghost"
          className="text-destructive hover:text-destructive"
          disabled={isLocked || isBusy}
          title={isSelf ? t("table.ownRow") : undefined}
          onClick={() => open("disable")}
        >
          {t("actions.disable")}
        </Button>
      )}
      {showReinvite && (
        <Button
          type="button"
          variant="ghost"
          disabled={isLocked || isBusy}
          title={isSelf ? t("table.ownRow") : undefined}
          onClick={() => open("reinvite")}
        >
          {t("actions.reinvite")}
        </Button>
      )}
      {error && <p className="text-sm text-destructive">{getErrorMessage(error, tCommon)}</p>}

      <ConfirmDialog
        open={confirming === "disable"}
        title={t("disable.title", { email: user.email })}
        description={t("disable.description")}
        confirmLabel={t("actions.disable")}
        confirmMatch={user.email}
        onCancel={() => setConfirming(null)}
        onConfirm={confirm}
      />
      <ConfirmDialog
        open={confirming === "reinvite"}
        title={t("reinviteConfirm.title", { email: user.email })}
        description={t("reinviteConfirm.description")}
        confirmLabel={t("actions.reinvite")}
        onCancel={() => setConfirming(null)}
        onConfirm={confirm}
      />
    </div>
  );
}

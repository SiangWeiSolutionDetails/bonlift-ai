import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useCurrentUser } from "@/features/auth/queries";
import { getErrorMessage } from "@/lib/error-message";
import { useBrandUsers, useChangeBrandUserRole, useRemoveBrandUser } from "../queries";
import type { BrandUser } from "../type";
import { useRoleOptions } from "../use-role-options";
import { BrandUsersTable } from "./brand-users-table";
import { EditBrandUserRoleDialog } from "./edit-brand-user-role-dialog";

type BrandUsersSectionProps = {
  brandId: string;
  readOnly: boolean;
};

export function BrandUsersSection({ brandId, readOnly }: BrandUsersSectionProps) {
  const { t } = useTranslation("brands");
  const { t: tCommon } = useTranslation();
  const me = useCurrentUser();
  const { data: brandUsers, error, isPending } = useBrandUsers(brandId);
  const roles = useRoleOptions(brandUsers ?? [], brandId);
  const changeMutation = useChangeBrandUserRole(brandId);
  const removeMutation = useRemoveBrandUser(brandId);
  const [toEdit, setToEdit] = useState<BrandUser | null>(null);
  const [toRemove, setToRemove] = useState<BrandUser | null>(null);
  // Not cleared on close, so the title doesn't go blank while the dialog animates out
  const [removeTitleName, setRemoveTitleName] = useState("");

  return (
    <>
      {removeMutation.error && (
        <p className="text-sm text-destructive">{getErrorMessage(removeMutation.error, tCommon)}</p>
      )}

      <BrandUsersTable
        brandUsers={brandUsers}
        isPending={isPending}
        error={error}
        currentUserId={me.id}
        isBusy={changeMutation.isPending || removeMutation.isPending}
        onEdit={
          readOnly
            ? undefined
            : (brandUser) => {
                changeMutation.reset();
                setToEdit(brandUser);
              }
        }
        onRemove={
          readOnly
            ? undefined
            : (brandUser) => {
                removeMutation.reset();
                setRemoveTitleName(brandUser.displayName ?? brandUser.email);
                setToRemove(brandUser);
              }
        }
      />

      <EditBrandUserRoleDialog
        brandUser={toEdit}
        roles={roles}
        mutation={changeMutation}
        onClose={() => setToEdit(null)}
      />

      <ConfirmDialog
        open={toRemove !== null}
        title={t("users.removeConfirmTitle", { name: removeTitleName })}
        description={t("users.removeConfirmDescription")}
        confirmLabel={t("users.remove")}
        onCancel={() => setToRemove(null)}
        onConfirm={() => {
          if (toRemove && !removeMutation.isPending) removeMutation.mutate(toRemove.userId);
          setToRemove(null);
        }}
      />
    </>
  );
}

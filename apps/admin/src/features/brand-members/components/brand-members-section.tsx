import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useCurrentUser } from "@/features/auth/queries";
import { getErrorMessage } from "@/lib/error-message";
import { useBrandMembers, useChangeBrandMemberRole, useRemoveBrandMember } from "../queries";
import type { BrandMember } from "../type";
import { useRoleOptions } from "../use-role-options";
import { BrandMembersTable } from "./brand-members-table";
import { EditMemberRoleDialog } from "./edit-member-role-dialog";

type BrandMembersSectionProps = {
  brandId: string;
  readOnly: boolean;
};

export function BrandMembersSection({ brandId, readOnly }: BrandMembersSectionProps) {
  const { t } = useTranslation("brands");
  const { t: tCommon } = useTranslation();
  const me = useCurrentUser();
  const { data: members, error, isPending } = useBrandMembers(brandId);
  const roles = useRoleOptions(members ?? [], brandId);
  const changeMutation = useChangeBrandMemberRole(brandId);
  const removeMutation = useRemoveBrandMember(brandId);
  const [toEdit, setToEdit] = useState<BrandMember | null>(null);
  const [toRemove, setToRemove] = useState<BrandMember | null>(null);
  // Not cleared on close, so the title doesn't go blank while the dialog animates out
  const [removeTitleName, setRemoveTitleName] = useState("");

  return (
    <>
      {removeMutation.error && (
        <p className="text-sm text-destructive">{getErrorMessage(removeMutation.error, tCommon)}</p>
      )}

      <BrandMembersTable
        members={members}
        isPending={isPending}
        error={error}
        currentUserId={me.id}
        isBusy={changeMutation.isPending || removeMutation.isPending}
        onEdit={
          readOnly
            ? undefined
            : (member) => {
                changeMutation.reset();
                setToEdit(member);
              }
        }
        onRemove={
          readOnly
            ? undefined
            : (member) => {
                removeMutation.reset();
                setRemoveTitleName(member.displayName ?? member.email);
                setToRemove(member);
              }
        }
      />

      <EditMemberRoleDialog
        member={toEdit}
        roles={roles}
        mutation={changeMutation}
        onClose={() => setToEdit(null)}
      />

      <ConfirmDialog
        open={toRemove !== null}
        title={t("members.removeConfirmTitle", { name: removeTitleName })}
        description={t("members.removeConfirmDescription")}
        confirmLabel={t("members.remove")}
        onCancel={() => setToRemove(null)}
        onConfirm={() => {
          if (toRemove && !removeMutation.isPending) removeMutation.mutate(toRemove.userId);
          setToRemove(null);
        }}
      />
    </>
  );
}

import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { getErrorMessage } from "@/lib/error-message";
import type { useChangeBrandMemberRole } from "../queries";
import type { BrandMember } from "../type";
import type { RoleOption } from "../use-role-options";
import { RoleSelect } from "./role-select";

type ChangeRoleMutation = ReturnType<typeof useChangeBrandMemberRole>;

type EditMemberRoleDialogProps = {
  member: BrandMember | null;
  roles: RoleOption[];
  mutation: ChangeRoleMutation;
  onClose: () => void;
};

export function EditMemberRoleDialog({ member, roles, mutation, onClose }: EditMemberRoleDialogProps) {
  const { t } = useTranslation("brands");
  // Kept after close so the title doesn't go blank while the dialog animates out
  const [lastMember, setLastMember] = useState(member);
  if (member && member !== lastMember) setLastMember(member);
  const shown = member ?? lastMember;

  return (
    <Dialog open={member !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="truncate">
            {t("members.editTitle", { name: shown?.displayName ?? shown?.email })}
          </DialogTitle>
        </DialogHeader>
        {member && (
          <EditMemberRoleForm
            key={member.userId}
            member={member}
            roles={roles}
            mutation={mutation}
            onSaved={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

type EditMemberRoleFormProps = {
  member: BrandMember;
  roles: RoleOption[];
  mutation: ChangeRoleMutation;
  onSaved: () => void;
};

function EditMemberRoleForm({ member, roles, mutation, onSaved }: EditMemberRoleFormProps) {
  const { t } = useTranslation("brands");
  const { t: tCommon } = useTranslation();
  const [roleId, setRoleId] = useState(member.roleId);
  const options = roles.some((role) => role.id === member.roleId)
    ? roles
    : [...roles, { id: member.roleId, name: member.roleName }];

  function submit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate({ userId: member.userId, roleId }, { onSuccess: onSaved });
  }

  return (
    <form onSubmit={submit} className="grid gap-6">
      <div className="grid gap-2">
        <Label htmlFor="member-edit-role">{t("members.role")}</Label>
        <RoleSelect
          id="member-edit-role"
          value={roleId}
          options={options}
          disabled={mutation.isPending}
          onChange={setRoleId}
        />
      </div>
      {mutation.error && (
        <p className="text-sm text-destructive">{getErrorMessage(mutation.error, tCommon)}</p>
      )}
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            {tCommon("actions.cancel")}
          </Button>
        </DialogClose>
        <Button type="submit" disabled={mutation.isPending || roleId === member.roleId}>
          {tCommon(mutation.isPending ? "actions.saving" : "actions.save")}
        </Button>
      </DialogFooter>
    </form>
  );
}

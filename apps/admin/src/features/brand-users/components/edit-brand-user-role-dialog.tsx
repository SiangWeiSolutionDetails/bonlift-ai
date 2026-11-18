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
import type { useChangeBrandUserRole } from "../queries";
import type { BrandUser } from "../type";
import type { RoleOption } from "../use-role-options";
import { RoleSelect } from "./role-select";

type ChangeRoleMutation = ReturnType<typeof useChangeBrandUserRole>;

type EditBrandUserRoleDialogProps = {
  brandUser: BrandUser | null;
  roles: RoleOption[];
  mutation: ChangeRoleMutation;
  onClose: () => void;
};

export function EditBrandUserRoleDialog({ brandUser, roles, mutation, onClose }: EditBrandUserRoleDialogProps) {
  const { t } = useTranslation("brands");
  // Kept after close so the title doesn't go blank while the dialog animates out
  const [lastBrandUser, setLastBrandUser] = useState(brandUser);
  if (brandUser && brandUser !== lastBrandUser) setLastBrandUser(brandUser);
  const shown = brandUser ?? lastBrandUser;

  return (
    <Dialog open={brandUser !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="truncate">
            {t("users.editTitle", { name: shown?.displayName ?? shown?.email })}
          </DialogTitle>
        </DialogHeader>
        {brandUser && (
          <EditBrandUserRoleForm
            key={brandUser.userId}
            brandUser={brandUser}
            roles={roles}
            mutation={mutation}
            onSaved={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

type EditBrandUserRoleFormProps = {
  brandUser: BrandUser;
  roles: RoleOption[];
  mutation: ChangeRoleMutation;
  onSaved: () => void;
};

function EditBrandUserRoleForm({ brandUser, roles, mutation, onSaved }: EditBrandUserRoleFormProps) {
  const { t } = useTranslation("brands");
  const { t: tCommon } = useTranslation();
  const [roleId, setRoleId] = useState(brandUser.roleId);
  const options = roles.some((role) => role.id === brandUser.roleId)
    ? roles
    : [...roles, { id: brandUser.roleId, name: brandUser.roleName }];

  function submit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate({ userId: brandUser.userId, roleId }, { onSuccess: onSaved });
  }

  return (
    <form onSubmit={submit} className="grid gap-6">
      <div className="grid gap-2">
        <Label htmlFor="brand-user-edit-role">{t("users.role")}</Label>
        <RoleSelect
          id="brand-user-edit-role"
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
        <Button type="submit" disabled={mutation.isPending || roleId === brandUser.roleId}>
          {tCommon(mutation.isPending ? "actions.saving" : "actions.save")}
        </Button>
      </DialogFooter>
    </form>
  );
}

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api-client";
import { getErrorMessage } from "@/lib/error-message";
import { useAddBrandUser, useBrandUsers } from "../queries";
import { useRoleOptions, type RoleOption } from "../use-role-options";
import { RoleSelect } from "./role-select";

type AddBrandUserDialogProps = {
  brandId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function AddBrandUserDialog({ brandId, open, onOpenChange }: AddBrandUserDialogProps) {
  const { t } = useTranslation("brands");
  const { data: brandUsers } = useBrandUsers(brandId);
  const roles = useRoleOptions(brandUsers ?? [], brandId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t("users.newTitle")}</DialogTitle>
        </DialogHeader>
        {/* Lives inside DialogContent, which unmounts on close, so form state resets for free */}
        <AddBrandUserForm brandId={brandId} roles={roles} onAdded={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

type AddBrandUserFormProps = {
  brandId: string;
  roles: RoleOption[];
  onAdded: () => void;
};

function AddBrandUserForm({ brandId, roles, onAdded }: AddBrandUserFormProps) {
  const { t } = useTranslation("brands");
  const { t: tCommon } = useTranslation();
  const mutation = useAddBrandUser(brandId);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [roleId, setRoleId] = useState("");
  const trimmedEmail = email.trim();
  const trimmedName = displayName.trim();

  function submit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate(
      { email: trimmedEmail, roleId, ...(trimmedName && { displayName: trimmedName }) },
      { onSuccess: onAdded },
    );
  }

  const error = mutation.error;
  const errorMessage =
    error instanceof ApiError && error.status === 409
      ? t("users.accountDisabled")
      : error && getErrorMessage(error, tCommon);

  return (
    <form onSubmit={submit} className="grid gap-6">
      <div className="grid gap-2">
        <Label htmlFor="brand-user-email">{t("users.email")}</Label>
        <Input
          id="brand-user-email"
          type="email"
          value={email}
          autoComplete="off"
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="brand-user-name">{t("users.displayName")}</Label>
        <Input
          id="brand-user-name"
          value={displayName}
          autoComplete="off"
          onChange={(event) => setDisplayName(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">{t("users.displayNameHint")}</p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="brand-user-role">{t("users.role")}</Label>
        <RoleSelect
          id="brand-user-role"
          value={roleId}
          options={roles}
          placeholder={t("users.rolePlaceholder")}
          disabled={mutation.isPending}
          onChange={setRoleId}
        />
      </div>
      {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            {tCommon("actions.cancel")}
          </Button>
        </DialogClose>
        <Button type="submit" disabled={mutation.isPending || !trimmedEmail || !roleId}>
          {t(mutation.isPending ? "users.adding" : "users.add")}
        </Button>
      </DialogFooter>
    </form>
  );
}

import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
import { usePermissions } from "@/features/auth/permissions";
import { brandMemberKeys } from "@/features/brand-members/queries";
import { roleKeys, useRoles } from "@/features/roles/queries";
import { getErrorMessage } from "@/lib/error-message";
import { buildInviteBody, hasAnyRole } from "../invite-request";
import { useInviteUser } from "../queries";
import { ConsoleRoleSelect } from "./console-role-select";
import { UserBrandRolesField, type BrandRoleEntry } from "./user-brand-roles-field";

type InviteUserDialogProps = {
  open: boolean;
  onClose: () => void;
};

const NO_ERRORS: ReadonlyMap<string, string> = new Map();

export function InviteUserDialog({ open, onClose }: InviteUserDialogProps) {
  const { t } = useTranslation("users");
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent
        aria-describedby={undefined}
        className="flex max-h-[calc(100dvh-2rem)] flex-col sm:max-w-xl"
      >
        <DialogHeader>
          <DialogTitle>{t("invite.title")}</DialogTitle>
        </DialogHeader>
        {open && <InviteForm onDone={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function InviteForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation("users");
  const { t: tCommon } = useTranslation();
  const queryClient = useQueryClient();
  const { canConsole } = usePermissions();
  const canConsoleRole = canConsole("users.assignConsoleRoles");
  const canBrandRoles = canConsole("users.assignBrandRoles");
  const { data: brandRoleOptions = [] } = useRoles("brand");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [consoleRoleId, setConsoleRoleId] = useState<string | null>(null);
  const [entries, setEntries] = useState<BrandRoleEntry[]>([]);
  const mutation = useInviteUser();
  const brandRoles = entries.map(({ brandId, roleId }) => ({ brandId, roleId }));
  const state = { email, displayName, consoleRoleId, brandRoles };
  const roleChosen = hasAnyRole(state);

  function invalidateAssigned() {
    void queryClient.invalidateQueries({ queryKey: roleKeys.all });
    for (const { brandId } of brandRoles) {
      void queryClient.invalidateQueries({ queryKey: brandMemberKeys.list(brandId) });
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate(buildInviteBody(state), {
      onSuccess: () => {
        invalidateAssigned();
        onDone();
      },
    });
  }

  return (
    <form onSubmit={submit} className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
      <div className="-mx-6 grid min-h-0 min-w-0 flex-1 content-start gap-4 overflow-y-auto px-6">
        <div className="grid min-w-0 gap-2">
          <Label htmlFor="invite-email">{t("invite.email")}</Label>
          <Input
            id="invite-email"
            type="email"
            value={email}
            autoComplete="off"
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div className="grid min-w-0 gap-2">
          <Label htmlFor="invite-name">{t("invite.displayName")}</Label>
          <Input
            id="invite-name"
            value={displayName}
            autoComplete="off"
            onChange={(event) => setDisplayName(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">{t("invite.displayNameHint")}</p>
        </div>
        {canConsoleRole && (
          <div className="grid min-w-0 gap-2">
            <Label htmlFor="invite-console-role">{t("edit.consoleRole")}</Label>
            <ConsoleRoleSelect
              id="invite-console-role"
              value={consoleRoleId}
              disabled={mutation.isPending}
              onChange={setConsoleRoleId}
            />
          </div>
        )}
        {canBrandRoles && (
          <section className="grid min-w-0 gap-2">
            <p className="text-sm font-medium">{t("brandRoles.title")}</p>
            <UserBrandRolesField
              entries={entries}
              roles={brandRoleOptions}
              editable
              disabled={mutation.isPending}
              errors={NO_ERRORS}
              onChange={(next) => setEntries(next.filter((entry) => !entry.removed))}
            />
          </section>
        )}
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
        <Button type="submit" disabled={mutation.isPending || !email.trim() || !roleChosen}>
          {t(mutation.isPending ? "invite.submitting" : "invite.submit")}
        </Button>
      </DialogFooter>
      {!roleChosen && (
        <p className="text-right text-xs text-muted-foreground">{t("invite.roleRequired")}</p>
      )}
    </form>
  );
}

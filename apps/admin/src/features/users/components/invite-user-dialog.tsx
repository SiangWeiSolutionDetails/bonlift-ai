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
import { getErrorMessage } from "@/lib/error-message";
import { useInviteUser } from "../queries";

type InviteUserDialogProps = {
  open: boolean;
  onClose: () => void;
};

export function InviteUserDialog({ open, onClose }: InviteUserDialogProps) {
  const { t } = useTranslation("users");
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent aria-describedby={undefined}>
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
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const mutation = useInviteUser();
  const trimmedEmail = email.trim();
  const trimmedName = displayName.trim();

  function submit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate(
      { email: trimmedEmail, ...(trimmedName && { displayName: trimmedName }) },
      { onSuccess: onDone },
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="invite-email">{t("invite.email")}</Label>
        <Input
          id="invite-email"
          type="email"
          value={email}
          autoComplete="off"
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="invite-name">{t("invite.displayName")}</Label>
        <Input
          id="invite-name"
          value={displayName}
          autoComplete="off"
          onChange={(event) => setDisplayName(event.target.value)}
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
        <Button type="submit" disabled={mutation.isPending || !trimmedEmail}>
          {t(mutation.isPending ? "invite.submitting" : "invite.submit")}
        </Button>
      </DialogFooter>
    </form>
  );
}

import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { getErrorMessage } from "@/lib/error-message";
import type { Outlet, UpdateOutletInput } from "../type";

const NAME_MAX_LENGTH = 255;

type EditOutletDialogProps = {
  outlet: Outlet | null;
  onClose: () => void;
};

export function EditOutletDialog({ outlet, onClose }: EditOutletDialogProps) {
  const { t } = useTranslation("outlets");

  return (
    <Dialog open={outlet !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("edit.title")}</DialogTitle>
          <DialogDescription>{t("edit.description")}</DialogDescription>
        </DialogHeader>
        {/* key resets the form state when a different outlet is opened */}
        {outlet && <EditOutletForm key={outlet.id} outlet={outlet} onSaved={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

type EditOutletFormProps = {
  outlet: Outlet;
  onSaved: () => void;
};

function EditOutletForm({ outlet, onSaved }: EditOutletFormProps) {
  const { t } = useTranslation("outlets");
  const { t: tCommon } = useTranslation();
  const [name, setName] = useState(outlet.name);
  const [isActive, setIsActive] = useState(outlet.isActive);

  // IMPLEMENT: replace these two with `const updateOutletMutation = useUpdateOutlet()`
  // and read `isPending` / `error` from it.
  const isSubmitting = false;
  const submitError = null as Error | null;

  const trimmedName = name.trim();
  // PATCH only what changed; the API rejects an empty body (minProperties: 1)
  const changes: UpdateOutletInput = {
    ...(trimmedName !== outlet.name && { name: trimmedName }),
    ...(isActive !== outlet.isActive && { isActive }),
  };
  const hasChanges = Object.keys(changes).length > 0;
  const canSubmit = hasChanges && trimmedName !== "" && !isSubmitting;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    // IMPLEMENT: call the update mutation with `{ outletId: outlet.id, input: changes }`
    // and call `onSaved()` in its onSuccess.
    void onSaved;
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="edit-outlet-name">{t("edit.name")}</Label>
        <Input
          id="edit-outlet-name"
          value={name}
          maxLength={NAME_MAX_LENGTH}
          onChange={(event) => setName(event.target.value)}
        />
      </div>

      <div className="flex items-center justify-between gap-4 rounded-xl bg-muted px-4 py-3">
        <Label htmlFor="edit-outlet-active">{t("edit.active")}</Label>
        <Switch id="edit-outlet-active" checked={isActive} onCheckedChange={setIsActive} />
      </div>

      {submitError && (
        <p className="text-sm text-destructive">{getErrorMessage(submitError, tCommon)}</p>
      )}

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            {tCommon("actions.cancel")}
          </Button>
        </DialogClose>
        <Button type="submit" disabled={!canSubmit}>
          {isSubmitting ? tCommon("actions.saving") : tCommon("actions.save")}
        </Button>
      </DialogFooter>
    </form>
  );
}

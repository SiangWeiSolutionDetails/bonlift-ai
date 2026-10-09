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
import { getErrorMessage } from "@/lib/error-message";

const NAME_MAX_LENGTH = 255;

type CreateTenantDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CreateTenantDialog({ open, onOpenChange }: CreateTenantDialogProps) {
  const { t } = useTranslation("tenants");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("create.title")}</DialogTitle>
          <DialogDescription>{t("create.description")}</DialogDescription>
        </DialogHeader>
        {/* Lives inside DialogContent, which unmounts on close, so form state resets for free */}
        <CreateTenantForm onCreated={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

type CreateTenantFormProps = {
  onCreated: () => void;
};

function CreateTenantForm({ onCreated }: CreateTenantFormProps) {
  const { t } = useTranslation("tenants");
  const { t: tCommon } = useTranslation();
  const [name, setName] = useState("");

  // IMPLEMENT: replace these two with `const createTenantMutation = useCreateTenant()`
  // and read `isPending` / `error` from it.
  const isSubmitting = false;
  const submitError = null as Error | null;

  const trimmedName = name.trim();
  const canSubmit = trimmedName !== "" && !isSubmitting;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    // IMPLEMENT: call the create mutation with `{ name: trimmedName }`
    // and call `onCreated()` in its onSuccess.
    void onCreated;
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="tenant-name">{t("create.name")}</Label>
        <Input
          id="tenant-name"
          value={name}
          maxLength={NAME_MAX_LENGTH}
          onChange={(event) => setName(event.target.value)}
        />
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
          {isSubmitting ? tCommon("actions.creating") : tCommon("actions.create")}
        </Button>
      </DialogFooter>
    </form>
  );
}

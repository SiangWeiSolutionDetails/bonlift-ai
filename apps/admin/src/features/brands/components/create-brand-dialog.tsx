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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Tenant } from "@/features/tenants/type";
import { getErrorMessage } from "@/lib/error-message";

const NAME_MAX_LENGTH = 255;

type CreateBrandDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenants: Tenant[];
};

export function CreateBrandDialog({ open, onOpenChange, tenants }: CreateBrandDialogProps) {
  const { t } = useTranslation("brands");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("create.title")}</DialogTitle>
          <DialogDescription>{t("create.description")}</DialogDescription>
        </DialogHeader>
        {/* Lives inside DialogContent, which unmounts on close, so form state resets for free */}
        <CreateBrandForm tenants={tenants} onCreated={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

type CreateBrandFormProps = {
  tenants: Tenant[];
  onCreated: () => void;
};

function CreateBrandForm({ tenants, onCreated }: CreateBrandFormProps) {
  const { t } = useTranslation("brands");
  const { t: tCommon } = useTranslation();
  const [tenantId, setTenantId] = useState("");
  const [name, setName] = useState("");

  // IMPLEMENT: replace these two with `const createBrandMutation = useCreateBrand()`
  // and read `isPending` / `error` from it.
  const isSubmitting = false;
  const submitError = null as Error | null;

  const trimmedName = name.trim();
  const canSubmit = tenantId !== "" && trimmedName !== "" && !isSubmitting;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    // IMPLEMENT: call the create mutation with `{ tenantId, name: trimmedName }`
    // and call `onCreated()` in its onSuccess.
    void onCreated;
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="brand-tenant">{t("create.tenant")}</Label>
        <Select value={tenantId} onValueChange={setTenantId}>
          <SelectTrigger id="brand-tenant" className="w-full">
            <SelectValue placeholder={t("create.tenantPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            {tenants.map((tenant) => (
              <SelectItem key={tenant.id} value={tenant.id}>
                {tenant.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="brand-name">{t("create.name")}</Label>
        <Input
          id="brand-name"
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

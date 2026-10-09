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
import type { Brand } from "@/features/brands/type";
import { getErrorMessage } from "@/lib/error-message";

const NAME_MAX_LENGTH = 255;

type CreateOutletDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brands: Brand[];
  defaultBrandId?: string;
};

export function CreateOutletDialog({
  open,
  onOpenChange,
  brands,
  defaultBrandId,
}: CreateOutletDialogProps) {
  const { t } = useTranslation("outlets");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("create.title")}</DialogTitle>
          <DialogDescription>{t("create.description")}</DialogDescription>
        </DialogHeader>
        {/* Lives inside DialogContent, which unmounts on close, so form state resets for free */}
        <CreateOutletForm
          brands={brands}
          defaultBrandId={defaultBrandId}
          onCreated={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

type CreateOutletFormProps = {
  brands: Brand[];
  defaultBrandId?: string;
  onCreated: () => void;
};

function CreateOutletForm({ brands, defaultBrandId, onCreated }: CreateOutletFormProps) {
  const { t } = useTranslation("outlets");
  const { t: tCommon } = useTranslation();
  // Pre-selects the brand the page is filtered by, saving a click
  const [brandId, setBrandId] = useState(defaultBrandId ?? "");
  const [name, setName] = useState("");

  // IMPLEMENT: replace these two with `const createOutletMutation = useCreateOutlet()`
  // and read `isPending` / `error` from it.
  const isSubmitting = false;
  const submitError = null as Error | null;

  const trimmedName = name.trim();
  const canSubmit = brandId !== "" && trimmedName !== "" && !isSubmitting;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    // IMPLEMENT: call the create mutation with `{ brandId, name: trimmedName }`
    // and call `onCreated()` in its onSuccess.
    void onCreated;
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="outlet-brand">{t("create.brand")}</Label>
        <Select value={brandId} onValueChange={setBrandId}>
          <SelectTrigger id="outlet-brand" className="w-full">
            <SelectValue placeholder={t("create.brandPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            {brands.map((brand) => (
              <SelectItem key={brand.id} value={brand.id}>
                {brand.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="outlet-name">{t("create.name")}</Label>
        <Input
          id="outlet-name"
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

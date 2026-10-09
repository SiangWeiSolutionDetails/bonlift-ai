import { useState, type FormEvent } from "react";
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
import type { Brand, UpdateBrandInput } from "../type";

const NAME_MAX_LENGTH = 255;

type EditBrandDialogProps = {
  brand: Brand | null;
  onClose: () => void;
};

export function EditBrandDialog({ brand, onClose }: EditBrandDialogProps) {
  return (
    <Dialog open={brand !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit brand</DialogTitle>
          <DialogDescription>Rename the brand or change its status.</DialogDescription>
        </DialogHeader>
        {/* key resets the form state when a different brand is opened */}
        {brand && <EditBrandForm key={brand.id} brand={brand} onSaved={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

type EditBrandFormProps = {
  brand: Brand;
  onSaved: () => void;
};

function EditBrandForm({ brand, onSaved }: EditBrandFormProps) {
  const [name, setName] = useState(brand.name);
  const [isActive, setIsActive] = useState(brand.isActive);

  // IMPLEMENT: replace these two with `const updateBrandMutation = useUpdateBrand()`
  // and read `isPending` / `error` from it.
  const isSubmitting = false;
  const submitError = null as Error | null;

  const trimmedName = name.trim();
  // PATCH only what changed; the API rejects an empty body (minProperties: 1)
  const changes: UpdateBrandInput = {
    ...(trimmedName !== brand.name && { name: trimmedName }),
    ...(isActive !== brand.isActive && { isActive }),
  };
  const hasChanges = Object.keys(changes).length > 0;
  const canSubmit = hasChanges && trimmedName !== "" && !isSubmitting;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    // IMPLEMENT: call the update mutation with `{ brandId: brand.id, input: changes }`
    // and call `onSaved()` in its onSuccess.
    void onSaved;
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="edit-brand-name">Name</Label>
        <Input
          id="edit-brand-name"
          value={name}
          maxLength={NAME_MAX_LENGTH}
          onChange={(event) => setName(event.target.value)}
        />
      </div>

      <div className="flex items-center justify-between gap-4">
        <Label htmlFor="edit-brand-active">Active</Label>
        <Switch id="edit-brand-active" checked={isActive} onCheckedChange={setIsActive} />
      </div>

      {submitError && <p className="text-sm text-destructive">{submitError.message}</p>}

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={!canSubmit}>
          {isSubmitting ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}

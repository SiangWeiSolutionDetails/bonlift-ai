import { useTranslation } from "react-i18next";
import { FieldError } from "@/components/field-error";
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
import { getChanges } from "@/lib/get-changes";
import type { Brand, UpdateBrandInput } from "../type";
import { Controller, useForm } from "react-hook-form";
import { typeboxResolver } from "@/lib/typebox-resolver";
import { UpdateBrandBodySchema } from "@ai-services/contracts";
import { useUpdateBrand } from "../queries";

type EditBrandDialogProps = {
  brand: Brand | null;
  onClose: () => void;
};

export function EditBrandDialog({ brand, onClose }: EditBrandDialogProps) {
  const { t } = useTranslation("brands");

  return (
    <Dialog open={brand !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("edit.title")}</DialogTitle>
          <DialogDescription>{t("edit.description")}</DialogDescription>
        </DialogHeader>
        {/* key resets the form state when a different brand is opened */}
        {brand && (
          <EditBrandForm key={brand.id} brand={brand} onSaved={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}

type EditBrandFormProps = {
  brand: Brand;
  onSaved: () => void;
};

function EditBrandForm({ brand, onSaved }: EditBrandFormProps) {
  const { t } = useTranslation("brands");
  const { t: tCommon } = useTranslation();
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<UpdateBrandInput>({
    resolver: typeboxResolver(UpdateBrandBodySchema),
    defaultValues: { name: brand.name, isActive: brand.isActive },
  });

  const updateBrandMutation = useUpdateBrand();
  const isSubmitting = updateBrandMutation.isPending;
  const submitError = updateBrandMutation.error;

  function onSubmit(values: UpdateBrandInput) {
    // PATCH only what changed; the API rejects an empty body (minProperties: 1)
    const changes = getChanges(brand, values);
    if (Object.keys(changes).length === 0) return onSaved();

    updateBrandMutation.mutate(
      { brandId: brand.id, input: changes },
      { onSuccess: onSaved },
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="edit-brand-name">{t("edit.name")}</Label>
        <Input
          id="edit-brand-name"
          aria-invalid={!!errors.name}
          {...register("name", { setValueAs: (value: string) => value.trim() })}
        />
        <FieldError message={errors.name?.message} />
      </div>

      <div className="flex items-center justify-between gap-4 rounded-xl bg-muted px-4 py-3">
        <Label htmlFor="edit-brand-active">{t("edit.active")}</Label>
        <Controller
          control={control}
          name="isActive"
          render={({ field }) => (
            <Switch
              id="edit-brand-active"
              checked={field.value}
              onCheckedChange={field.onChange}
            />
          )}
        />
      </div>

      {submitError && (
        <p className="text-sm text-destructive">
          {getErrorMessage(submitError, tCommon)}
        </p>
      )}

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            {tCommon("actions.cancel")}
          </Button>
        </DialogClose>
        <Button type="submit" disabled={!isDirty || isSubmitting}>
          {isSubmitting ? tCommon("actions.saving") : tCommon("actions.save")}
        </Button>
      </DialogFooter>
    </form>
  );
}

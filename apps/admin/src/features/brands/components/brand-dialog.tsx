import { useTranslation } from "react-i18next";
import { FieldError } from "@/components/field-error";
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
import { Switch } from "@/components/ui/switch";
import { getErrorMessage } from "@/lib/error-message";
import { getChanges } from "@/lib/get-changes";
import type { Brand, UpdateBrandInput } from "../type";
import { Controller, useForm } from "react-hook-form";
import { typeboxResolver } from "@/lib/typebox-resolver";
import { UpdateBrandBodySchema } from "@ai-services/contracts";
import { useUpdateBrand } from "../queries";
import { BrandDataSourceSection } from "@/features/brand-data-source/components/brand-data-source-section";
import { OutletItemScoresConfigSection } from "@/features/outlet-item-scores-config/components/outlet-item-scores-config-section";

type BrandDialogProps = {
  brand: Brand | null;
  readOnly?: boolean;
  onClose: () => void;
};

export function BrandDialog({ brand, readOnly = false, onClose }: BrandDialogProps) {
  const { t } = useTranslation("brands");
  const mode = readOnly ? "view" : "edit";

  return (
    <Dialog open={brand !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t(`${mode}.title`)}</DialogTitle>
        </DialogHeader>
        {/* key resets the form state when a different brand is opened */}
        {brand && (
          <BrandForm
            key={brand.id}
            brand={brand}
            readOnly={readOnly}
            onSaved={onClose}
          />
        )}
        {brand && (
          <BrandDataSourceSection
            key={`${brand.id}-data-source`}
            brandId={brand.id}
            readOnly={readOnly}
          />
        )}
        {brand && (
          <OutletItemScoresConfigSection
            key={`${brand.id}-outlet-item-scores-config`}
            brandId={brand.id}
            readOnly={readOnly}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

type BrandFormProps = {
  brand: Brand;
  readOnly: boolean;
  onSaved: () => void;
};

function BrandForm({ brand, readOnly, onSaved }: BrandFormProps) {
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
    if (readOnly) return;

    // PATCH only what changed; the API rejects an empty body (minProperties: 1)
    const changes = getChanges(brand, values);
    if (Object.keys(changes).length === 0) return onSaved();

    updateBrandMutation.mutate(
      { brandId: brand.id, input: changes },
      { onSuccess: onSaved },
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-6">
      <div className="grid gap-2">
        <Label htmlFor="brand-name">{t("edit.name")}</Label>
        <Input
          id="brand-name"
          readOnly={readOnly}
          aria-invalid={!!errors.name}
          {...register("name", { setValueAs: (value: string) => value.trim() })}
        />
        <FieldError message={errors.name?.message} />
      </div>

      <div className="flex items-center justify-between gap-4 rounded-xl bg-muted px-4 py-3">
        <Label htmlFor="brand-active">{t("edit.active")}</Label>
        <Controller
          control={control}
          name="isActive"
          render={({ field }) => (
            <Switch
              id="brand-active"
              checked={field.value}
              disabled={readOnly}
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

      {!readOnly && (
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
      )}
    </form>
  );
}

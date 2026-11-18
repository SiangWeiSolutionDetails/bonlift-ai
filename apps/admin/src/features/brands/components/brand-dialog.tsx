import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/components/confirm-dialog";
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
import { UpdateBrandBodySchema } from "@bonlift-ai/contracts";
import { useUpdateBrand } from "../queries";
import { usePermissions } from "@/features/auth/permissions";

type BrandDialogProps = {
  brand: Brand | null;
  tenantName: string | undefined;
  readOnly?: boolean;
  onClose: () => void;
};

export function BrandDialog({ brand, tenantName, readOnly = false, onClose }: BrandDialogProps) {
  const { t } = useTranslation("brands");
  const mode = readOnly ? "view" : "edit";
  const { canConsole } = usePermissions();

  return (
    <Dialog open={brand !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{t(`${mode}.title`)}</DialogTitle>
          <DialogDescription>{brand?.name}</DialogDescription>
        </DialogHeader>
        {brand && (
          // key resets the form when a different brand is opened
          <BrandForm
            key={brand.id}
            brand={brand}
            tenantName={tenantName}
            readOnly={readOnly || !canConsole("brands.edit")}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

type PendingSave = {
  values: UpdateBrandInput;
  changes: UpdateBrandInput;
};

type BrandFormProps = {
  brand: Brand;
  tenantName: string | undefined;
  readOnly: boolean;
};

function BrandForm({ brand, tenantName, readOnly }: BrandFormProps) {
  const { t } = useTranslation("brands");
  const { t: tCommon } = useTranslation();
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<UpdateBrandInput>({
    resolver: typeboxResolver(UpdateBrandBodySchema),
    defaultValues: { name: brand.name, isActive: brand.isActive },
  });

  const updateBrandMutation = useUpdateBrand();
  const isSubmitting = updateBrandMutation.isPending;
  const submitError = updateBrandMutation.error;
  const [pendingSave, setPendingSave] = useState<PendingSave | null>(null);

  function onSubmit(values: UpdateBrandInput) {
    if (readOnly) return;

    // PATCH only what changed; the API rejects an empty body (minProperties: 1)
    const changes = getChanges(brand, values);
    if (Object.keys(changes).length === 0) return;

    setPendingSave({ values, changes });
  }

  function save({ values, changes }: PendingSave) {
    updateBrandMutation.mutate(
      { brandId: brand.id, input: changes },
      { onSuccess: () => reset(values) },
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col gap-4">
      <ConfirmDialog
        open={pendingSave !== null}
        onCancel={() => setPendingSave(null)}
        onConfirm={() => pendingSave && save(pendingSave)}
      />
      {/* Scroll inside the body so the scrollbar doesn't clip the dialog's rounded corners */}
      <div className="-mx-6 grid min-h-0 flex-1 content-start gap-6 overflow-y-auto px-6 pb-1">
        {/* Tenant is fixed once a brand is created, so it's never editable */}
        <div className="grid gap-2">
          <Label htmlFor="brand-tenant">{t("edit.tenant")}</Label>
          <Input id="brand-tenant" readOnly value={tenantName ?? "—"} />
        </div>

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

        <div className="flex items-center justify-between gap-4 rounded-xl border px-4 py-3">
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
      </div>

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

import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { UpdateOutletBodySchema } from "@ai-services/contracts";
import { ConfirmDialog } from "@/components/confirm-dialog";
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
import { typeboxResolver } from "@/lib/typebox-resolver";
import type { Outlet, UpdateOutletInput } from "../type";
import { useUpdateOutlet } from "../queries";

type OutletDialogProps = {
  outlet: Outlet | null;
  readOnly?: boolean;
  onClose: () => void;
};

export function OutletDialog({ outlet, readOnly = false, onClose }: OutletDialogProps) {
  const { t } = useTranslation("outlets");
  const mode = readOnly ? "view" : "edit";

  return (
    <Dialog open={outlet !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t(`${mode}.title`)}</DialogTitle>
        </DialogHeader>
        {/* key resets the form state when a different outlet is opened */}
        {outlet && (
          <OutletForm
            key={outlet.id}
            outlet={outlet}
            readOnly={readOnly}
            onSaved={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

type OutletFormProps = {
  outlet: Outlet;
  readOnly: boolean;
  onSaved: () => void;
};

function OutletForm({ outlet, readOnly, onSaved }: OutletFormProps) {
  const { t } = useTranslation("outlets");
  const { t: tCommon } = useTranslation();
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<UpdateOutletInput>({
    resolver: typeboxResolver(UpdateOutletBodySchema),
    defaultValues: { name: outlet.name, isActive: outlet.isActive },
  });

  const updateOutletMutation = useUpdateOutlet();
  const isSubmitting = updateOutletMutation.isPending;
  const submitError = updateOutletMutation.error;
  const [pendingChanges, setPendingChanges] = useState<UpdateOutletInput | null>(null);

  function onSubmit(values: UpdateOutletInput) {
    if (readOnly) return;

    // PATCH only what changed; the API rejects an empty body (minProperties: 1)
    const changes = getChanges(outlet, values);
    if (Object.keys(changes).length === 0) return onSaved();

    setPendingChanges(changes);
  }

  function save(changes: UpdateOutletInput) {
    updateOutletMutation.mutate(
      { outletId: outlet.id, input: changes },
      { onSuccess: onSaved },
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-6">
      <ConfirmDialog
        open={pendingChanges !== null}
        onCancel={() => setPendingChanges(null)}
        onConfirm={() => pendingChanges && save(pendingChanges)}
      />
      <div className="grid gap-2">
        <Label htmlFor="outlet-name">{t("edit.name")}</Label>
        <Input
          id="outlet-name"
          readOnly={readOnly}
          aria-invalid={!!errors.name}
          {...register("name", { setValueAs: (value: string) => value.trim() })}
        />
        <FieldError message={errors.name?.message} />
      </div>

      <div className="flex items-center justify-between gap-4 rounded-xl bg-muted px-4 py-3">
        <Label htmlFor="outlet-active">{t("edit.active")}</Label>
        <Controller
          control={control}
          name="isActive"
          render={({ field }) => (
            <Switch
              id="outlet-active"
              checked={field.value}
              disabled={readOnly}
              onCheckedChange={field.onChange}
            />
          )}
        />
      </div>

      {submitError && (
        <p className="text-sm text-destructive">{getErrorMessage(submitError, tCommon)}</p>
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

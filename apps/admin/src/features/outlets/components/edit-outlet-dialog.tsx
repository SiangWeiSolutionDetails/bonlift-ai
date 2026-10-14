import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { UpdateOutletBodySchema } from "@ai-services/contracts";
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
import { typeboxResolver } from "@/lib/typebox-resolver";
import type { Outlet, UpdateOutletInput } from "../type";
import { useUpdateOutlet } from "../queries";

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

  function onSubmit(values: UpdateOutletInput) {
    // PATCH only what changed; the API rejects an empty body (minProperties: 1)
    const changes = getChanges(outlet, values);
    if (Object.keys(changes).length === 0) return onSaved();

    updateOutletMutation.mutate(
      { outletId: outlet.id, input: changes },
      { onSuccess: onSaved },
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="edit-outlet-name">{t("edit.name")}</Label>
        <Input
          id="edit-outlet-name"
          aria-invalid={!!errors.name}
          {...register("name", { setValueAs: (value: string) => value.trim() })}
        />
        <FieldError message={errors.name?.message} />
      </div>

      <div className="flex items-center justify-between gap-4 rounded-xl bg-muted px-4 py-3">
        <Label htmlFor="edit-outlet-active">{t("edit.active")}</Label>
        <Controller
          control={control}
          name="isActive"
          render={({ field }) => (
            <Switch
              id="edit-outlet-active"
              checked={field.value}
              onCheckedChange={field.onChange}
            />
          )}
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
        <Button type="submit" disabled={!isDirty || isSubmitting}>
          {isSubmitting ? tCommon("actions.saving") : tCommon("actions.save")}
        </Button>
      </DialogFooter>
    </form>
  );
}

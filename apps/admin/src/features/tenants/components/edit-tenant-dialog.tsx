import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { UpdateTenantBodySchema } from "@ai-services/contracts";
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
import type { Tenant, UpdateTenantInput } from "../type";
import { useUpdateTenant } from "../queries";

type EditTenantDialogProps = {
  tenant: Tenant | null;
  onClose: () => void;
};

export function EditTenantDialog({ tenant, onClose }: EditTenantDialogProps) {
  const { t } = useTranslation("tenants");

  return (
    <Dialog open={tenant !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("edit.title")}</DialogTitle>
          <DialogDescription>{t("edit.description")}</DialogDescription>
        </DialogHeader>
        {/* key resets the form state when a different tenant is opened */}
        {tenant && (
          <EditTenantForm key={tenant.id} tenant={tenant} onSaved={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}

type EditTenantFormProps = {
  tenant: Tenant;
  onSaved: () => void;
};

function EditTenantForm({ tenant, onSaved }: EditTenantFormProps) {
  const { t } = useTranslation("tenants");
  const { t: tCommon } = useTranslation();
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<UpdateTenantInput>({
    resolver: typeboxResolver(UpdateTenantBodySchema),
    defaultValues: { name: tenant.name, isActive: tenant.isActive },
  });

  const updateTenantMutation = useUpdateTenant();
  const isSubmitting = updateTenantMutation.isPending;
  const submitError = updateTenantMutation.error;

  function onSubmit(values: UpdateTenantInput) {
    // PATCH only what changed; the API rejects an empty body (minProperties: 1)
    const changes = getChanges(tenant, values);
    if (Object.keys(changes).length === 0) return onSaved();

    updateTenantMutation.mutate(
      {
        tenantId: tenant.id,
        input: changes,
      },
      { onSuccess: onSaved },
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="edit-tenant-name">{t("edit.name")}</Label>
        <Input
          id="edit-tenant-name"
          aria-invalid={!!errors.name}
          {...register("name", { setValueAs: (value: string) => value.trim() })}
        />
        <FieldError message={errors.name?.message} />
      </div>

      <div className="flex items-center justify-between gap-4 rounded-xl bg-muted px-4 py-3">
        <Label htmlFor="edit-tenant-active">{t("edit.active")}</Label>
        <Controller
          control={control}
          name="isActive"
          render={({ field }) => (
            <Switch
              id="edit-tenant-active"
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

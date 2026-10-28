import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { UpdateTenantBodySchema } from "@ai-services/contracts";
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
import type { Tenant, UpdateTenantInput } from "../type";
import { useUpdateTenant } from "../queries";

type TenantDialogProps = {
  tenant: Tenant | null;
  readOnly?: boolean;
  onClose: () => void;
};

export function TenantDialog({ tenant, readOnly = false, onClose }: TenantDialogProps) {
  const { t } = useTranslation("tenants");
  const mode = readOnly ? "view" : "edit";

  return (
    <Dialog open={tenant !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t(`${mode}.title`)}</DialogTitle>
        </DialogHeader>
        {/* key resets the form state when a different tenant is opened */}
        {tenant && (
          <TenantForm
            key={tenant.id}
            tenant={tenant}
            readOnly={readOnly}
            onSaved={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

type TenantFormProps = {
  tenant: Tenant;
  readOnly: boolean;
  onSaved: () => void;
};

function TenantForm({ tenant, readOnly, onSaved }: TenantFormProps) {
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

  const [pendingChanges, setPendingChanges] = useState<UpdateTenantInput | null>(null);

  function onSubmit(values: UpdateTenantInput) {
    if (readOnly) return;

    // PATCH only what changed; the API rejects an empty body (minProperties: 1)
    const changes = getChanges(tenant, values);
    if (Object.keys(changes).length === 0) return onSaved();

    setPendingChanges(changes);
  }

  function save(changes: UpdateTenantInput) {
    updateTenantMutation.mutate(
      {
        tenantId: tenant.id,
        input: changes,
      },
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
        <Label htmlFor="tenant-name">{t("edit.name")}</Label>
        <Input
          id="tenant-name"
          readOnly={readOnly}
          aria-invalid={!!errors.name}
          {...register("name", { setValueAs: (value: string) => value.trim() })}
        />
        <FieldError message={errors.name?.message} />
      </div>

      <div className="flex items-center justify-between gap-4 rounded-xl bg-muted px-4 py-3">
        <Label htmlFor="tenant-active">{t("edit.active")}</Label>
        <Controller
          control={control}
          name="isActive"
          render={({ field }) => (
            <Switch
              id="tenant-active"
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

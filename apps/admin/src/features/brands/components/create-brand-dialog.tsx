import { useTranslation } from "react-i18next";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Tenant } from "@/features/tenants/type";
import { getErrorMessage } from "@/lib/error-message";
import { CreateBrandBodySchema } from "@ai-services/contracts";
import { useCreateBrand } from "../queries";
import { Controller, useForm } from "react-hook-form";
import { typeboxResolver } from "@/lib/typebox-resolver";
import type { CreateBrandInput } from "../type";
import { FieldError } from "@/components/field-error";

type CreateBrandDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenants: Tenant[];
};

export function CreateBrandDialog({
  open,
  onOpenChange,
  tenants,
}: CreateBrandDialogProps) {
  const { t } = useTranslation("brands");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t("create.title")}</DialogTitle>
        </DialogHeader>
        {/* Lives inside DialogContent, which unmounts on close, so form state resets for free */}
        <CreateBrandForm
          tenants={tenants}
          onCreated={() => onOpenChange(false)}
        />
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
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateBrandInput>({
    resolver: typeboxResolver(CreateBrandBodySchema),
    defaultValues: { tenantId: "", name: "" },
  });

  const createBrandMutation = useCreateBrand();
  const isSubmitting = createBrandMutation.isPending;
  const submitError = createBrandMutation.error;

  function onSubmit(input: CreateBrandInput) {
    createBrandMutation.mutate(input, { onSuccess: onCreated });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-6">
      <div className="grid gap-2">
        <Label htmlFor="brand-tenant">{t("create.tenant")}</Label>
        <Controller
          control={control}
          name="tenantId"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger
                id="brand-tenant"
                className="w-full"
                aria-invalid={!!errors.tenantId}
              >
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
          )}
        />
        <FieldError message={errors.tenantId?.message} />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="brand-name">{t("create.name")}</Label>
        <Input
          id="brand-name"
          aria-invalid={!!errors.name}
          {...register("name", { setValueAs: (value: string) => value.trim() })}
        />
        <FieldError message={errors.name?.message} />
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
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? tCommon("actions.creating")
            : tCommon("actions.create")}
        </Button>
      </DialogFooter>
    </form>
  );
}

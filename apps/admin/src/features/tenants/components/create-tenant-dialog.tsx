import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { CreateTenantBodySchema } from "@ai-services/contracts";
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
import { getErrorMessage } from "@/lib/error-message";
import { typeboxResolver } from "@/lib/typebox-resolver";
import { useCreateTenant } from "../queries";
import type { CreateTenantInput } from "../type";

type CreateTenantDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CreateTenantDialog({
  open,
  onOpenChange,
}: CreateTenantDialogProps) {
  const { t } = useTranslation("tenants");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("create.title")}</DialogTitle>
          <DialogDescription>{t("create.description")}</DialogDescription>
        </DialogHeader>
        {/* Lives inside DialogContent, which unmounts on close, so form state resets for free */}
        <CreateTenantForm onCreated={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

type CreateTenantFormProps = {
  onCreated: () => void;
};

function CreateTenantForm({ onCreated }: CreateTenantFormProps) {
  const { t } = useTranslation("tenants");
  const { t: tCommon } = useTranslation();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateTenantInput>({
    resolver: typeboxResolver(CreateTenantBodySchema),
    defaultValues: { name: "" },
  });

  const createTenantMutation = useCreateTenant();
  const isSubmitting = createTenantMutation.isPending;
  const submitError = createTenantMutation.error;

  function onSubmit(input: CreateTenantInput) {
    createTenantMutation.mutate(input, { onSuccess: onCreated });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="tenant-name">{t("create.name")}</Label>
        <Input
          id="tenant-name"
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

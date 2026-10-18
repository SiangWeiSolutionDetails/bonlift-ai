import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { CreateOutletBodySchema } from "@ai-services/contracts";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Brand } from "@/features/brands/type";
import { getErrorMessage } from "@/lib/error-message";
import { typeboxResolver } from "@/lib/typebox-resolver";
import type { CreateOutletInput } from "../type";
import { useCreateOutlet } from "../queries";

type CreateOutletDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brands: Brand[];
  defaultBrandId?: string;
};

export function CreateOutletDialog({
  open,
  onOpenChange,
  brands,
  defaultBrandId,
}: CreateOutletDialogProps) {
  const { t } = useTranslation("outlets");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t("create.title")}</DialogTitle>
        </DialogHeader>
        {/* Lives inside DialogContent, which unmounts on close, so form state resets for free */}
        <CreateOutletForm
          brands={brands}
          defaultBrandId={defaultBrandId}
          onCreated={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

type CreateOutletFormProps = {
  brands: Brand[];
  defaultBrandId?: string;
  onCreated: () => void;
};

function CreateOutletForm({ brands, defaultBrandId, onCreated }: CreateOutletFormProps) {
  const { t } = useTranslation("outlets");
  const { t: tCommon } = useTranslation();
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateOutletInput>({
    resolver: typeboxResolver(CreateOutletBodySchema),
    // Pre-selects the brand the page is filtered by, saving a click
    defaultValues: { brandId: defaultBrandId ?? "", name: "" },
  });

  const createOutletMutation = useCreateOutlet();
  const isSubmitting = createOutletMutation.isPending;
  const submitError = createOutletMutation.error;

  function onSubmit(input: CreateOutletInput) {
    createOutletMutation.mutate(input, { onSuccess: onCreated });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-6">
      <div className="grid gap-2">
        <Label htmlFor="outlet-brand">{t("create.brand")}</Label>
        <Controller
          control={control}
          name="brandId"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger
                id="outlet-brand"
                className="w-full"
                aria-invalid={!!errors.brandId}
              >
                <SelectValue placeholder={t("create.brandPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {brands.map((brand) => (
                  <SelectItem key={brand.id} value={brand.id}>
                    {brand.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        <FieldError message={errors.brandId?.message} />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="outlet-name">{t("create.name")}</Label>
        <Input
          id="outlet-name"
          aria-invalid={!!errors.name}
          {...register("name", { setValueAs: (value: string) => value.trim() })}
        />
        <FieldError message={errors.name?.message} />
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
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? tCommon("actions.creating") : tCommon("actions.create")}
        </Button>
      </DialogFooter>
    </form>
  );
}

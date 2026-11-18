import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { CreateOutletBodySchema } from "@bonlift-ai/contracts";
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
import { getErrorMessage } from "@/lib/error-message";
import { typeboxResolver } from "@/lib/typebox-resolver";
import type { CreateOutletInput } from "../type";
import { useCreateOutlet } from "../queries";

type CreateOutletDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandId: string;
};

export function CreateOutletDialog({
  open,
  onOpenChange,
  brandId,
}: CreateOutletDialogProps) {
  const { t } = useTranslation("outlets");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t("create.title")}</DialogTitle>
        </DialogHeader>
        {/* Lives inside DialogContent, which unmounts on close, so form state resets for free */}
        <CreateOutletForm brandId={brandId} onCreated={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

type CreateOutletFormProps = {
  brandId: string;
  onCreated: () => void;
};

// New outlets belong to the workspace brand, so there is no brand to pick
function CreateOutletForm({ brandId, onCreated }: CreateOutletFormProps) {
  const { t } = useTranslation("outlets");
  const { t: tCommon } = useTranslation();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateOutletInput>({
    resolver: typeboxResolver(CreateOutletBodySchema),
    defaultValues: { brandId, name: "" },
  });

  const createOutletMutation = useCreateOutlet();
  const isSubmitting = createOutletMutation.isPending;
  const submitError = createOutletMutation.error;

  function onSubmit(input: CreateOutletInput) {
    createOutletMutation.mutate({ ...input, brandId }, { onSuccess: onCreated });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-6">
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

import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useForm, useWatch, type UseFormRegisterReturn } from "react-hook-form";
import { ChevronRightIcon } from "lucide-react";
import { CreateCustomerItemScoresCalculationConfigVersionBodySchema } from "@ai-services/contracts";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FieldError } from "@/components/field-error";
import { FieldHint } from "@/components/field-hint";
import { HalfLifePreview } from "@/components/half-life-preview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogFooter } from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { getErrorMessage } from "@/lib/error-message";
import { getChanges } from "@/lib/get-changes";
import { typeboxResolver } from "@/lib/typebox-resolver";
import {
  useCreateCustomerItemScoresConfigVersion,
  useCustomerItemScoresConfig,
} from "../queries";
import type {
  CreateCustomerItemScoresConfigVersionInput,
  CustomerItemScoresConfigVersion,
} from "../type";
import { CustomerItemScoresConfigVersions } from "./customer-item-scores-config-versions";

type CustomerItemScoresConfigSectionProps = {
  brandId: string;
  readOnly: boolean;
};

export function CustomerItemScoresConfigSection({
  brandId,
  readOnly,
}: CustomerItemScoresConfigSectionProps) {
  const { t } = useTranslation("brands");
  const { t: tCommon } = useTranslation();
  const { data: config, error, isPending } = useCustomerItemScoresConfig(brandId);
  // Held here because the form remounts on every new version, which would collapse the history
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  if (isPending) {
    return (
      <div className="grid gap-6">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-destructive">
        {getErrorMessage(error, tCommon)}
      </p>
    );
  }

  return (
    // key remounts the form with the new defaults whenever a new version becomes the latest
    <CustomerItemScoresConfigForm key={config.id} config={config} readOnly={readOnly}>
      <Collapsible
        open={isHistoryOpen}
        onOpenChange={setIsHistoryOpen}
        className="grid gap-3 border-t pt-4"
      >
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="group w-fit"
          >
            <ChevronRightIcon className="transition-transform group-data-[state=open]:rotate-90" />
            {t("customerItemScoresConfig.history.title")}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CustomerItemScoresConfigVersions
            brandId={brandId}
            latestVersionId={config.id}
            readOnly={readOnly}
          />
        </CollapsibleContent>
      </Collapsible>
    </CustomerItemScoresConfigForm>
  );
}

type CustomerItemScoresConfigFormProps = {
  config: CustomerItemScoresConfigVersion;
  readOnly: boolean;
  // Rendered at the end of the scrollable body, above the footer
  children: ReactNode;
};

function CustomerItemScoresConfigForm({
  config,
  readOnly,
  children,
}: CustomerItemScoresConfigFormProps) {
  const { t } = useTranslation("brands");
  const { t: tCommon } = useTranslation();
  const defaultValues: CreateCustomerItemScoresConfigVersionInput = {
    halfLifeDays: config.halfLifeDays,
    topN: config.topN,
  };
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<CreateCustomerItemScoresConfigVersionInput>({
    resolver: typeboxResolver(
      CreateCustomerItemScoresCalculationConfigVersionBodySchema,
    ),
    defaultValues,
  });
  const halfLifeDays = useWatch({ control, name: "halfLifeDays" });
  const [pendingChanges, setPendingChanges] =
    useState<CreateCustomerItemScoresConfigVersionInput | null>(null);

  const createVersionMutation = useCreateCustomerItemScoresConfigVersion();
  const isSubmitting = createVersionMutation.isPending;
  const submitError = createVersionMutation.error;

  function onSubmit(values: CreateCustomerItemScoresConfigVersionInput) {
    const changes = getChanges(defaultValues, values);
    if (Object.keys(changes).length === 0) return;

    setPendingChanges(changes);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col gap-4">
      <ConfirmDialog
        open={pendingChanges !== null}
        onCancel={() => setPendingChanges(null)}
        onConfirm={() =>
          pendingChanges &&
          createVersionMutation.mutate({
            brandId: config.brandId,
            input: pendingChanges,
          })
        }
      />
      <div className="-mx-6 grid min-h-0 flex-1 content-start gap-6 overflow-y-auto px-6 pb-1">
        <div className="flex items-start gap-2">
          <Badge variant="secondary" className="shrink-0">
            {t("customerItemScoresConfig.version", { version: config.version })}
          </Badge>
          <p className="text-sm text-muted-foreground">
            {t("customerItemScoresConfig.currentHint")}
          </p>
        </div>

        <div className="grid gap-x-4 gap-y-6 sm:grid-cols-2">
          <div className="grid content-start gap-3">
            <NumberField
              id="customer-item-scores-half-life-days"
              label={t("customerItemScoresConfig.halfLifeDays")}
              hint={t("customerItemScoresConfig.halfLifeDaysHint")}
              readOnly={readOnly}
              error={errors.halfLifeDays?.message}
              registration={register("halfLifeDays", { valueAsNumber: true })}
            />
            <HalfLifePreview halfLifeDays={halfLifeDays} />
          </div>
          <NumberField
            id="customer-item-scores-top-n"
            label={t("customerItemScoresConfig.topN")}
            hint={t("customerItemScoresConfig.topNHint")}
            readOnly={readOnly}
            error={errors.topN?.message}
            registration={register("topN", { valueAsNumber: true })}
          />
        </div>

        {submitError && (
          <p className="text-sm text-destructive">
            {getErrorMessage(submitError, tCommon)}
          </p>
        )}

        {children}
      </div>

      {!readOnly && (
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              {tCommon("actions.cancel")}
            </Button>
          </DialogClose>
          <Button type="submit" disabled={!isDirty || isSubmitting}>
            {isSubmitting
              ? tCommon("actions.saving")
              : t("customerItemScoresConfig.save")}
          </Button>
        </DialogFooter>
      )}
    </form>
  );
}

type NumberFieldProps = {
  id: string;
  label: string;
  hint: string;
  readOnly: boolean;
  error: string | undefined;
  registration: UseFormRegisterReturn;
};

function NumberField({
  id,
  label,
  hint,
  readOnly,
  error,
  registration,
}: NumberFieldProps) {
  return (
    <div className="grid content-start gap-2">
      <div className="flex items-center gap-1.5">
        <Label htmlFor={id}>{label}</Label>
        <FieldHint id={`${id}-hint`} hint={hint} />
      </div>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        step={1}
        readOnly={readOnly}
        aria-invalid={!!error}
        aria-describedby={`${id}-hint`}
        {...registration}
      />
      <FieldError message={error} />
    </div>
  );
}

import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useForm, type UseFormRegisterReturn } from "react-hook-form";
import { ChevronRightIcon } from "lucide-react";
import { CreateServingConfigVersionBodySchema } from "@bonlift-ai/contracts";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FieldError } from "@/components/field-error";
import { FieldHint } from "@/components/field-hint";
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
  useCreateServingConfigVersion,
  useServingConfig,
} from "../queries";
import type {
  CreateServingConfigVersionInput,
  ServingConfigVersion,
} from "../type";
import { ServingConfigVersions } from "./serving-config-versions";

type ServingConfigSectionProps = {
  brandId: string;
  readOnly: boolean;
};

export function ServingConfigSection({
  brandId,
  readOnly,
}: ServingConfigSectionProps) {
  const { t } = useTranslation("servingConfig");
  const { t: tCommon } = useTranslation();
  const { data: config, error, isPending } = useServingConfig(brandId);
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
    <ServingConfigForm key={config.id} config={config} readOnly={readOnly}>
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
            {t("history.title")}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ServingConfigVersions
            brandId={brandId}
            latestVersionId={config.id}
            readOnly={readOnly}
          />
        </CollapsibleContent>
      </Collapsible>
    </ServingConfigForm>
  );
}

type ServingConfigFormProps = {
  config: ServingConfigVersion;
  readOnly: boolean;
  // Rendered at the end of the scrollable body, above the footer
  children: ReactNode;
};

function ServingConfigForm({
  config,
  readOnly,
  children,
}: ServingConfigFormProps) {
  const { t } = useTranslation("servingConfig");
  const { t: tCommon } = useTranslation();
  const defaultValues: CreateServingConfigVersionInput = {
    minFavouriteOrders: config.minFavouriteOrders,
    bestSellerMaxRank: config.bestSellerMaxRank,
    bestSellerMinListSize: config.bestSellerMinListSize,
    rejectionSuppressionDays: config.rejectionSuppressionDays,
  };
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<CreateServingConfigVersionInput>({
    resolver: typeboxResolver(
      CreateServingConfigVersionBodySchema,
    ),
    defaultValues,
  });
  const [pendingChanges, setPendingChanges] =
    useState<CreateServingConfigVersionInput | null>(null);

  const createVersionMutation = useCreateServingConfigVersion();
  const isSubmitting = createVersionMutation.isPending;
  const submitError = createVersionMutation.error;

  function onSubmit(values: CreateServingConfigVersionInput) {
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
            {t("version", { version: config.version })}
          </Badge>
          <p className="text-sm text-muted-foreground">
            {t("currentHint")}
          </p>
        </div>

        <div className="grid gap-x-4 gap-y-6 sm:grid-cols-2">
          <NumberField
            id="serving-config-min-favourite-orders"
            label={t("minFavouriteOrders")}
            hint={t("minFavouriteOrdersHint")}
            readOnly={readOnly}
            error={errors.minFavouriteOrders?.message}
            registration={register("minFavouriteOrders", { valueAsNumber: true })}
          />
          <NumberField
            id="serving-config-best-seller-max-rank"
            label={t("bestSellerMaxRank")}
            hint={t("bestSellerMaxRankHint")}
            readOnly={readOnly}
            error={errors.bestSellerMaxRank?.message}
            registration={register("bestSellerMaxRank", { valueAsNumber: true })}
          />
          <NumberField
            id="serving-config-best-seller-min-list-size"
            label={t("bestSellerMinListSize")}
            hint={t("bestSellerMinListSizeHint")}
            readOnly={readOnly}
            error={errors.bestSellerMinListSize?.message}
            registration={register("bestSellerMinListSize", { valueAsNumber: true })}
          />
          <NumberField
            id="serving-config-rejection-suppression-days"
            label={t("rejectionSuppressionDays")}
            hint={t("rejectionSuppressionDaysHint")}
            readOnly={readOnly}
            error={errors.rejectionSuppressionDays?.message}
            registration={register("rejectionSuppressionDays", { valueAsNumber: true })}
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
              : t("save")}
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
  step?: number;
  readOnly: boolean;
  error: string | undefined;
  registration: UseFormRegisterReturn;
};

function NumberField({
  id,
  label,
  hint,
  step = 1,
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
        inputMode={step === 1 ? "numeric" : "decimal"}
        step={step}
        readOnly={readOnly}
        aria-invalid={!!error}
        aria-describedby={`${id}-hint`}
        {...registration}
      />
      <FieldError message={error} />
    </div>
  );
}

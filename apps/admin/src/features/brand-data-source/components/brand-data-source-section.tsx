import { useTranslation } from "react-i18next";
import { useForm, type UseFormRegisterReturn } from "react-hook-form";
import { UpdateBrandDataSourceBodySchema } from "@ai-services/contracts";
import { FieldError } from "@/components/field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { getErrorMessage } from "@/lib/error-message";
import { typeboxResolver } from "@/lib/typebox-resolver";
import { useBrandDataSource, useUpdateBrandDataSource } from "../queries";
import type { BrandDataSource, UpdateBrandDataSourceInput } from "../type";
import { getChanges } from "@/lib/get-changes";

type BrandDataSourceSectionProps = {
  brandId: string;
  readOnly: boolean;
};

export function BrandDataSourceSection({
  brandId,
  readOnly,
}: BrandDataSourceSectionProps) {
  const { t } = useTranslation("brands");

  return (
    <section className="grid gap-6">
      <Separator />
      <h3 className="font-heading text-base font-semibold">
        {t("dataSource.title")}
      </h3>
      <BrandDataSourceContent brandId={brandId} readOnly={readOnly} />
    </section>
  );
}

function BrandDataSourceContent({
  brandId,
  readOnly,
}: BrandDataSourceSectionProps) {
  const { t: tCommon } = useTranslation();
  const { data: dataSource, error, isPending } = useBrandDataSource(brandId);

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

  return <BrandDataSourceForm dataSource={dataSource} readOnly={readOnly} />;
}

type BrandDataSourceFormProps = {
  dataSource: BrandDataSource;
  readOnly: boolean;
};

function BrandDataSourceForm({
  dataSource,
  readOnly,
}: BrandDataSourceFormProps) {
  const { t } = useTranslation("brands");
  const { t: tCommon } = useTranslation();
  // url must match what setValueAs yields for an empty input (undefined), or isDirty is true on mount
  const defaultValues: UpdateBrandDataSourceInput = {
    url: dataSource.url ?? undefined,
    timeoutMs: dataSource.timeoutMs,
    refetchDays: dataSource.refetchDays,
    maxChunkDays: dataSource.maxChunkDays,
  };
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    reset,
  } = useForm<UpdateBrandDataSourceInput>({
    resolver: typeboxResolver(UpdateBrandDataSourceBodySchema),
    defaultValues,
  });

  const updateBrandDataSourceMutation = useUpdateBrandDataSource();
  const isSubmitting = updateBrandDataSourceMutation.isPending;
  const submitError = updateBrandDataSourceMutation.error;

  function onSubmit(values: UpdateBrandDataSourceInput) {
    const changes = getChanges(defaultValues, values);
    if (Object.keys(changes).length === 0) return;

    updateBrandDataSourceMutation.mutate(
      {
        brandId: dataSource.brandId,
        input: changes,
      },
      { onSuccess: () => reset(values) },
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-6">
      <div className="grid gap-2">
        <Label htmlFor="data-source-url">{t("dataSource.url")}</Label>
        <Input
          id="data-source-url"
          type="url"
          inputMode="url"
          readOnly={readOnly}
          placeholder={
            readOnly
              ? t("dataSource.notConfigured")
              : t("dataSource.urlPlaceholder")
          }
          aria-invalid={!!errors.url}
          {...register("url", {
            // An untouched, unconfigured URL is left out of the body instead of failing the pattern
            setValueAs: (value: string) => value.trim() || undefined,
          })}
        />
        <FieldError
          message={
            errors.url?.type === "pattern"
              ? "brands:dataSource.urlInvalid"
              : errors.url?.message
          }
        />
      </div>

      <NumberField
        id="data-source-timeout"
        label={t("dataSource.timeoutMs")}
        hint={t("dataSource.timeoutMsHint")}
        readOnly={readOnly}
        error={errors.timeoutMs?.message}
        registration={register("timeoutMs", { valueAsNumber: true })}
      />

      <div className="grid gap-x-4 gap-y-6 sm:grid-cols-2">
        <NumberField
          id="data-source-refetch-days"
          label={t("dataSource.refetchDays")}
          hint={t("dataSource.refetchDaysHint")}
          readOnly={readOnly}
          error={errors.refetchDays?.message}
          registration={register("refetchDays", { valueAsNumber: true })}
        />
        <NumberField
          id="data-source-max-chunk-days"
          label={t("dataSource.maxChunkDays")}
          hint={t("dataSource.maxChunkDaysHint")}
          readOnly={readOnly}
          error={errors.maxChunkDays?.message}
          registration={register("maxChunkDays", { valueAsNumber: true })}
        />
      </div>

      {submitError && (
        <p className="text-sm text-destructive">
          {getErrorMessage(submitError, tCommon)}
        </p>
      )}

      {!readOnly && (
        <div className="flex justify-end">
          <Button type="submit" disabled={!isDirty || isSubmitting}>
            {isSubmitting ? tCommon("actions.saving") : t("dataSource.save")}
          </Button>
        </div>
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
      <Label htmlFor={id}>{label}</Label>
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
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        {hint}
      </p>
      <FieldError message={error} />
    </div>
  );
}

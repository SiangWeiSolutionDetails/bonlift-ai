import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useFieldArray,
  useForm,
  type UseFormRegisterReturn,
} from "react-hook-form";
import {
  HistoryIcon,
  PlusIcon,
  Trash2Icon,
  TrendingUpIcon,
} from "lucide-react";
import {
  CreateOutletItemScoresCalculationConfigVersionBodySchema,
  findDaypartIssue,
  type DaypartIssue,
} from "@ai-services/contracts";
import { FieldError } from "@/components/field-error";
import { SectionCard } from "@/components/section-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { getErrorMessage } from "@/lib/error-message";
import { typeboxResolver } from "@/lib/typebox-resolver";
import {
  useCreateOutletItemScoresConfigVersion,
  useOutletItemScoresConfig,
} from "../queries";
import type {
  CreateOutletItemScoresConfigVersionInput,
  Daypart,
  OutletItemScoresConfigVersion,
} from "../type";
import { OutletItemScoresConfigVersions } from "./outlet-item-scores-config-versions";

type OutletItemScoresConfigSectionProps = {
  brandId: string;
  readOnly: boolean;
};

export function OutletItemScoresConfigSection({
  brandId,
  readOnly,
}: OutletItemScoresConfigSectionProps) {
  const { t } = useTranslation("brands");
  const { data: config, isPending } = useOutletItemScoresConfig(brandId);

  return (
    <>
      <SectionCard
        title={t("outletItemScoresConfig.title")}
        icon={TrendingUpIcon}
        action={
          config && (
            <Badge variant="secondary">
              {t("outletItemScoresConfig.version", { version: config.version })}
            </Badge>
          )
        }
        className="lg:col-span-2"
      >
        <OutletItemScoresConfigContent brandId={brandId} readOnly={readOnly} />
      </SectionCard>
      <SectionCard
        title={t("outletItemScoresConfig.history.title")}
        icon={HistoryIcon}
        tone="primary"
      >
        {config ? (
          <OutletItemScoresConfigVersions
            brandId={brandId}
            latestVersionId={config.id}
            readOnly={readOnly}
          />
        ) : (
          isPending && <Skeleton className="h-16 w-full" />
        )}
      </SectionCard>
    </>
  );
}

function OutletItemScoresConfigContent({
  brandId,
  readOnly,
}: OutletItemScoresConfigSectionProps) {
  const { t: tCommon } = useTranslation();
  const { data: config, error, isPending } = useOutletItemScoresConfig(brandId);

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
    <OutletItemScoresConfigForm
      key={config.id}
      config={config}
      readOnly={readOnly}
    />
  );
}

// Array fields are compared by value; getChanges compares by reference.
function getConfigChanges(
  original: CreateOutletItemScoresConfigVersionInput,
  current: CreateOutletItemScoresConfigVersionInput,
): CreateOutletItemScoresConfigVersionInput {
  const changes: CreateOutletItemScoresConfigVersionInput = {};
  if (current.halfLifeDays !== original.halfLifeDays) {
    changes.halfLifeDays = current.halfLifeDays;
  }
  if (current.topN !== original.topN) changes.topN = current.topN;
  if (
    JSON.stringify(toComparable(current.dayparts)) !==
    JSON.stringify(toComparable(original.dayparts))
  ) {
    changes.dayparts = current.dayparts;
  }
  return changes;
}

function toComparable(dayparts: Daypart[] = []) {
  return dayparts.map(({ name, start, end }) => [name, start, end]);
}

type OutletItemScoresConfigFormProps = {
  config: OutletItemScoresConfigVersion;
  readOnly: boolean;
};

function OutletItemScoresConfigForm({
  config,
  readOnly,
}: OutletItemScoresConfigFormProps) {
  const { t } = useTranslation("brands");
  const { t: tCommon } = useTranslation();
  const defaultValues: CreateOutletItemScoresConfigVersionInput = {
    halfLifeDays: config.halfLifeDays,
    topN: config.topN,
    dayparts: config.dayparts.map(({ name, start, end }) => ({
      name,
      start,
      end,
    })),
  };
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<CreateOutletItemScoresConfigVersionInput>({
    resolver: typeboxResolver(
      CreateOutletItemScoresCalculationConfigVersionBodySchema,
    ),
    defaultValues,
  });
  const { fields, append, remove } = useFieldArray({
    control,
    name: "dayparts",
  });
  const [daypartIssue, setDaypartIssue] = useState<DaypartIssue | null>(null);

  const createVersionMutation = useCreateOutletItemScoresConfigVersion();
  const isSubmitting = createVersionMutation.isPending;
  const submitError = createVersionMutation.error;

  function onSubmit(values: CreateOutletItemScoresConfigVersionInput) {
    // Same rules as the API, checked here so the user sees which dayparts are wrong
    const issue = findDaypartIssue(values.dayparts ?? []);
    setDaypartIssue(issue);
    if (issue) return;

    const changes = getConfigChanges(defaultValues, values);
    if (Object.keys(changes).length === 0) return;

    createVersionMutation.mutate({ brandId: config.brandId, input: changes });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-6">
      <p className="text-sm text-muted-foreground">
        {t("outletItemScoresConfig.currentHint")}
      </p>

      <div className="grid gap-x-4 gap-y-6 sm:grid-cols-2">
        <NumberField
          id="outlet-item-scores-half-life-days"
          label={t("outletItemScoresConfig.halfLifeDays")}
          hint={t("outletItemScoresConfig.halfLifeDaysHint")}
          readOnly={readOnly}
          error={errors.halfLifeDays?.message}
          registration={register("halfLifeDays", { valueAsNumber: true })}
        />
        <NumberField
          id="outlet-item-scores-top-n"
          label={t("outletItemScoresConfig.topN")}
          hint={t("outletItemScoresConfig.topNHint")}
          readOnly={readOnly}
          error={errors.topN?.message}
          registration={register("topN", { valueAsNumber: true })}
        />
      </div>

      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-medium">
          {t("outletItemScoresConfig.dayparts")}
        </legend>
        <p className="text-xs text-muted-foreground">
          {t("outletItemScoresConfig.daypartsHint")}
        </p>

        {fields.length === 0 && (
          <p className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">
            {t("outletItemScoresConfig.wholeDay")}
          </p>
        )}

        {fields.map((field, index) => {
          const daypartErrors = errors.dayparts?.[index];
          return (
            <div key={field.id} className="grid gap-3 rounded-xl border p-3">
              <div className="flex items-start gap-2">
                <div className="grid flex-1 gap-1">
                  <Label htmlFor={`daypart-${index}-name`}>
                    {t("outletItemScoresConfig.daypartName")}
                  </Label>
                  <Input
                    id={`daypart-${index}-name`}
                    readOnly={readOnly}
                    aria-invalid={!!daypartErrors?.name}
                    {...register(`dayparts.${index}.name`, {
                      setValueAs: (value: string) => value.trim(),
                    })}
                  />
                  <FieldError message={daypartErrors?.name?.message} />
                </div>
                {!readOnly && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="mt-6"
                    aria-label={t("outletItemScoresConfig.removeDaypart")}
                    onClick={() => remove(index)}
                  >
                    <Trash2Icon />
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="grid gap-1">
                  <Label htmlFor={`daypart-${index}-start`}>
                    {t("outletItemScoresConfig.daypartStart")}
                  </Label>
                  <Input
                    id={`daypart-${index}-start`}
                    type="time"
                    readOnly={readOnly}
                    aria-invalid={!!daypartErrors?.start}
                    {...register(`dayparts.${index}.start`)}
                  />
                  <FieldError message={daypartErrors?.start?.message} />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor={`daypart-${index}-end`}>
                    {t("outletItemScoresConfig.daypartEnd")}
                  </Label>
                  <Input
                    id={`daypart-${index}-end`}
                    type="time"
                    readOnly={readOnly}
                    aria-invalid={!!daypartErrors?.end}
                    {...register(`dayparts.${index}.end`)}
                  />
                  <FieldError message={daypartErrors?.end?.message} />
                </div>
              </div>
            </div>
          );
        })}

        {daypartIssue && (
          <p className="text-sm text-destructive">
            {t(`outletItemScoresConfig.issues.${daypartIssue.code}`, daypartIssue)}
          </p>
        )}

        {!readOnly && (
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => append({ name: "", start: "", end: "" })}
            >
              <PlusIcon />
              {t("outletItemScoresConfig.addDaypart")}
            </Button>
          </div>
        )}
      </fieldset>

      {submitError && (
        <p className="text-sm text-destructive">
          {getErrorMessage(submitError, tCommon)}
        </p>
      )}

      {!readOnly && (
        <div className="flex justify-end">
          <Button type="submit" disabled={!isDirty || isSubmitting}>
            {isSubmitting
              ? tCommon("actions.saving")
              : t("outletItemScoresConfig.save")}
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

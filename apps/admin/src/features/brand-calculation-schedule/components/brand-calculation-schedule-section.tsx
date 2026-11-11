import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Controller, useForm, type UseFormRegisterReturn } from "react-hook-form";
import { UpdateBrandCalculationScheduleBodySchema } from "@bonlift-ai/contracts";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FieldError } from "@/components/field-error";
import { FieldHint } from "@/components/field-hint";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { TimePicker } from "@/components/time-picker";
import { formatDateTime } from "@/lib/date-format";
import { getErrorMessage } from "@/lib/error-message";
import { getChanges } from "@/lib/get-changes";
import { typeboxResolver } from "@/lib/typebox-resolver";
import {
  useBrandCalculationSchedule,
  useUpdateBrandCalculationSchedule,
} from "../queries";
import type {
  BrandCalculationSchedule,
  UpdateBrandCalculationScheduleInput,
} from "../type";

type BrandCalculationScheduleSectionProps = {
  brandId: string;
  readOnly: boolean;
};

export function BrandCalculationScheduleSection({
  brandId,
  readOnly,
}: BrandCalculationScheduleSectionProps) {
  const { t: tCommon } = useTranslation();
  const { data: schedule, error, isPending } = useBrandCalculationSchedule(brandId);

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

  return <BrandCalculationScheduleForm schedule={schedule} readOnly={readOnly} />;
}

type PendingSave = {
  values: UpdateBrandCalculationScheduleInput;
  changes: UpdateBrandCalculationScheduleInput;
};

type BrandCalculationScheduleFormProps = {
  schedule: BrandCalculationSchedule;
  readOnly: boolean;
};

function BrandCalculationScheduleForm({
  schedule,
  readOnly,
}: BrandCalculationScheduleFormProps) {
  const { t } = useTranslation("brands");
  const { t: tCommon } = useTranslation();
  const defaultValues: UpdateBrandCalculationScheduleInput = {
    isEnabled: schedule.isEnabled,
    runTime: schedule.runTime,
    timeZone: schedule.timeZone,
    outletWindowDays: schedule.outletWindowDays,
    customerWindowDays: schedule.customerWindowDays,
    affinityWindowDays: schedule.affinityWindowDays,
  };
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<UpdateBrandCalculationScheduleInput>({
    resolver: typeboxResolver(UpdateBrandCalculationScheduleBodySchema),
    defaultValues,
  });
  const timeZones = useTimeZones(schedule.timeZone);

  const updateScheduleMutation = useUpdateBrandCalculationSchedule();
  const isSubmitting = updateScheduleMutation.isPending;
  const submitError = updateScheduleMutation.error;
  const [pendingSave, setPendingSave] = useState<PendingSave | null>(null);

  function onSubmit(values: UpdateBrandCalculationScheduleInput) {
    const changes = getChanges(defaultValues, values);
    if (Object.keys(changes).length === 0) return;

    setPendingSave({ values, changes });
  }

  function save({ values, changes }: PendingSave) {
    updateScheduleMutation.mutate(
      { brandId: schedule.brandId, input: changes },
      { onSuccess: () => reset(values) },
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col gap-4">
      <ConfirmDialog
        open={pendingSave !== null}
        onCancel={() => setPendingSave(null)}
        onConfirm={() => pendingSave && save(pendingSave)}
      />
      <div className="-mx-6 grid min-h-0 flex-1 content-start gap-6 overflow-y-auto px-6 pb-1">
        <div className="flex items-center justify-between gap-4 rounded-xl border px-4 py-3">
          <div className="grid gap-1">
            <Label htmlFor="schedule-enabled">{t("schedule.enabled")}</Label>
            <p className="text-sm text-muted-foreground">{t("schedule.enabledHint")}</p>
          </div>
          <Controller
            control={control}
            name="isEnabled"
            render={({ field }) => (
              <Switch
                id="schedule-enabled"
                checked={field.value}
                disabled={readOnly}
                onCheckedChange={field.onChange}
              />
            )}
          />
        </div>

        <div className="grid gap-x-4 gap-y-6 sm:grid-cols-2">
          <div className="grid content-start gap-2">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="schedule-run-time">{t("schedule.runTime")}</Label>
              <FieldHint id="schedule-run-time-hint" hint={t("schedule.runTimeHint")} />
            </div>
            <Controller
              control={control}
              name="runTime"
              render={({ field }) => (
                <TimePicker
                  id="schedule-run-time"
                  value={field.value ?? ""}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  readOnly={readOnly}
                  invalid={!!errors.runTime}
                  describedBy="schedule-run-time-hint"
                />
              )}
            />
            <FieldError message={errors.runTime?.message} />
          </div>

          <div className="grid content-start gap-2">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="schedule-time-zone">{t("schedule.timeZone")}</Label>
              <FieldHint id="schedule-time-zone-hint" hint={t("schedule.timeZoneHint")} />
            </div>
            <Controller
              control={control}
              name="timeZone"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange} disabled={readOnly}>
                  <SelectTrigger
                    id="schedule-time-zone"
                    className="w-full"
                    aria-invalid={!!errors.timeZone}
                    aria-describedby="schedule-time-zone-hint"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {timeZones.map((zone) => (
                      <SelectItem key={zone} value={zone}>
                        {zone}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FieldError message={errors.timeZone?.message} />
          </div>
        </div>

        <div className="grid gap-x-4 gap-y-6 sm:grid-cols-3">
          <NumberField
            id="schedule-outlet-window-days"
            label={t("schedule.outletWindowDays")}
            hint={t("schedule.outletWindowDaysHint")}
            readOnly={readOnly}
            error={errors.outletWindowDays?.message}
            registration={register("outletWindowDays", { valueAsNumber: true })}
          />
          <NumberField
            id="schedule-customer-window-days"
            label={t("schedule.customerWindowDays")}
            hint={t("schedule.customerWindowDaysHint")}
            readOnly={readOnly}
            error={errors.customerWindowDays?.message}
            registration={register("customerWindowDays", { valueAsNumber: true })}
          />
          <NumberField
            id="schedule-affinity-window-days"
            label={t("schedule.affinityWindowDays")}
            hint={t("schedule.affinityWindowDaysHint")}
            readOnly={readOnly}
            error={errors.affinityWindowDays?.message}
            registration={register("affinityWindowDays", { valueAsNumber: true })}
          />
        </div>

        <ScheduleStatus schedule={schedule} />

        {submitError && (
          <p className="text-sm text-destructive">
            {getErrorMessage(submitError, tCommon)}
          </p>
        )}
      </div>

      {!readOnly && (
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              {tCommon("actions.cancel")}
            </Button>
          </DialogClose>
          <Button type="submit" disabled={!isDirty || isSubmitting}>
            {isSubmitting ? tCommon("actions.saving") : t("schedule.save")}
          </Button>
        </DialogFooter>
      )}
    </form>
  );
}

// Shows the saved schedule, not unsaved edits: the next run only changes once the schedule is saved.
function ScheduleStatus({ schedule }: { schedule: BrandCalculationSchedule }) {
  const { t, i18n } = useTranslation("brands");
  const hasRun = schedule.lastRunAt !== null;

  return (
    <section className="grid gap-3 rounded-xl border px-4 py-3">
      <h3 className="text-sm font-medium">{t("schedule.status.title")}</h3>
      <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
        <StatusItem label={t("schedule.status.nextRun")}>
          {schedule.isEnabled && schedule.nextRunAt
            ? formatDateTime(schedule.nextRunAt)
            : t("schedule.status.paused")}
        </StatusItem>
        <StatusItem label={t("schedule.status.lastRun")}>
          {hasRun ? formatDateTime(schedule.lastRunAt as string) : t("schedule.status.neverRun")}
        </StatusItem>
        {hasRun && (
          <>
            <StatusItem label={t("schedule.status.queued")}>
              <span className="tabular-nums">
                {(schedule.lastQueued ?? 0).toLocaleString(i18n.language)}
              </span>
            </StatusItem>
            <StatusItem label={t("schedule.status.failedToQueue")}>
              <span className="tabular-nums">
                {(schedule.lastFailedToQueue ?? 0).toLocaleString(i18n.language)}
              </span>
            </StatusItem>
          </>
        )}
      </dl>
      {schedule.lastError && (
        <p className="text-sm text-destructive">
          {t("schedule.status.lastError", { error: schedule.lastError })}
        </p>
      )}
    </section>
  );
}

function StatusItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid content-start gap-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

// The browser's zone list can lack a saved zone (e.g. an alias like "UTC"), so the saved one is always offered.
function useTimeZones(current: string) {
  return useMemo(() => {
    const zones = Intl.supportedValuesOf("timeZone");
    return zones.includes(current) ? zones : [current, ...zones];
  }, [current]);
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
        min={1}
        max={366}
        readOnly={readOnly}
        aria-invalid={!!error}
        aria-describedby={`${id}-hint`}
        {...registration}
      />
      <FieldError message={error} />
    </div>
  );
}

import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBrandChannels } from "@/features/brand-channels/queries";
import { useOutlets } from "@/features/outlets/queries";
import { FEEDBACK_REASONS, type RunOption } from "../feedback";
import { useFeedbackLabels } from "../use-feedback-labels";
import { RunName } from "./run-name";

// Radix Select has no empty item value, so "All" needs a value no outlet id, daypart or reason can take.
const ALL = "__all__";

export type FeedbackFilterValues = {
  outletId?: string;
  daypart?: string;
  reason?: string;
  channelId?: string;
  runId?: string;
};

type FilterOption = { value: string; label: ReactNode };

type FilterSelectProps = {
  id: string;
  label: string;
  value: string | undefined;
  options: FilterOption[];
  onChange: (value: string | undefined) => void;
  triggerClassName?: string;
};

function FilterSelect({
  id,
  label,
  value,
  options,
  onChange,
  triggerClassName = "w-44",
}: FilterSelectProps) {
  const { t } = useTranslation("recommendationFeedback");

  return (
    <div className="flex items-center gap-3">
      <Label htmlFor={id} className="shrink-0">
        {label}
      </Label>
      <Select
        value={value ?? ALL}
        onValueChange={(next) => onChange(next === ALL ? undefined : next)}
      >
        <SelectTrigger id={id} className={triggerClassName}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t("picker.all")}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

type FeedbackFiltersProps = {
  brandId: string;
  values: FeedbackFilterValues;
  dayparts: string[];
  runs: RunOption[];
  onChange: (next: FeedbackFilterValues) => void;
};

export function FeedbackFilters({ brandId, values, dayparts, runs, onChange }: FeedbackFiltersProps) {
  const { t } = useTranslation("recommendationFeedback");
  const { reasonLabel, daypartLabel } = useFeedbackLabels();
  // Both share their cache entries with the outlets page and the brand's Channels tab
  const { data: outlets = [] } = useOutlets({ brandId });
  const { data: channels = [] } = useBrandChannels(brandId);

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
      <FilterSelect
        id="feedback-outlet"
        label={t("picker.outlet")}
        value={values.outletId}
        options={outlets.map((outlet) => ({ value: outlet.id, label: outlet.name }))}
        onChange={(outletId) => onChange({ outletId })}
      />
      <FilterSelect
        id="feedback-daypart"
        label={t("picker.daypart")}
        value={values.daypart}
        options={dayparts.map((daypart) => ({ value: daypart, label: daypartLabel(daypart) }))}
        onChange={(daypart) => onChange({ daypart })}
      />
      <FilterSelect
        id="feedback-reason"
        label={t("picker.reason")}
        value={values.reason}
        options={FEEDBACK_REASONS.map((reason) => ({ value: reason, label: reasonLabel(reason) }))}
        onChange={(reason) => onChange({ reason })}
      />
      <FilterSelect
        id="feedback-channel"
        label={t("picker.channel")}
        value={values.channelId}
        options={channels.map((channel) => ({
          value: channel.channelId,
          label: `${channel.name} (${channel.code})`,
        }))}
        onChange={(channelId) => onChange({ channelId })}
      />
      <FilterSelect
        id="feedback-run"
        label={t("picker.run")}
        value={values.runId}
        options={runs.map(({ runId, run }) => ({
          value: runId,
          label: <RunName runId={runId} run={run} />,
        }))}
        onChange={(runId) => onChange({ runId })}
        triggerClassName="w-80"
      />
    </div>
  );
}

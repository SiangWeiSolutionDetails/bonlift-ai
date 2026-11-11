import { useState } from "react";
import { ClockIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type TimePickerProps = {
  id?: string;
  // "HH:mm" (24-hour), or "" when nothing is picked
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  invalid?: boolean;
  readOnly?: boolean;
  describedBy?: string;
};

const HOURS = range(24);
const MINUTES = range(60);

export function TimePicker({
  id,
  value,
  onChange,
  onBlur,
  placeholder,
  invalid,
  readOnly,
  describedBy,
}: TimePickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  // Text being typed; null while the input shows the committed value.
  const [draft, setDraft] = useState<string | null>(null);
  const [hour = "", minute = ""] = parseTime(value) ? value.split(":") : [];

  const commitDraft = () => {
    if (draft === null) return;
    const trimmed = draft.trim();
    // Unparseable text is passed through so form validation can flag it.
    onChange(parseTime(trimmed) ?? trimmed);
    setDraft(null);
  };

  return (
    <Popover
      open={open && !readOnly}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) onBlur?.();
      }}
    >
      <PopoverAnchor asChild>
        <div className="relative">
          <Input
            id={id}
            value={draft ?? value}
            placeholder={placeholder ?? "HH:mm"}
            inputMode="numeric"
            autoComplete="off"
            maxLength={5}
            readOnly={readOnly}
            aria-invalid={invalid}
            aria-describedby={describedBy}
            className="pr-10 tabular-nums"
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => {
              commitDraft();
              onBlur?.();
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              commitDraft();
            }}
          />
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={readOnly}
              aria-label={t("timePicker.open")}
              className="absolute top-1/2 right-1 -translate-y-1/2 text-muted-foreground"
            >
              <ClockIcon />
            </Button>
          </PopoverTrigger>
        </div>
      </PopoverAnchor>
      <PopoverContent
        className="w-auto flex-row gap-1 p-1"
        align="start"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          focusSelected(event.currentTarget as HTMLElement);
        }}
      >
        <TimeColumn
          label={t("timePicker.hour")}
          options={HOURS}
          selected={hour}
          onSelect={(next) => onChange(`${next}:${minute || "00"}`)}
        />
        <TimeColumn
          label={t("timePicker.minute")}
          options={MINUTES}
          selected={minute}
          onSelect={(next) => onChange(`${hour || "00"}:${next}`)}
        />
      </PopoverContent>
    </Popover>
  );
}

type TimeColumnProps = {
  label: string;
  options: string[];
  selected: string;
  onSelect: (value: string) => void;
};

function TimeColumn({ label, options, selected, onSelect }: TimeColumnProps) {
  return (
    <div
      role="group"
      aria-label={label}
      data-time-column
      className="relative flex h-56 flex-col gap-0.5 overflow-y-auto overscroll-contain pr-0.5"
    >
      {options.map((option) => {
        const isSelected = option === selected;
        return (
          <Button
            key={option}
            type="button"
            size="sm"
            variant={isSelected ? "default" : "ghost"}
            aria-pressed={isSelected}
            data-selected={isSelected || undefined}
            className="w-11 shrink-0 tabular-nums"
            onClick={() => onSelect(option)}
          >
            {option}
          </Button>
        );
      })}
    </div>
  );
}

// Centres each column on its selected value without scrolling the page, then focuses the hour.
function focusSelected(content: HTMLElement) {
  const columns = content.querySelectorAll<HTMLElement>("[data-time-column]");
  columns.forEach((column) => {
    const item = column.querySelector<HTMLElement>("[data-selected]");
    if (!item) return;
    column.scrollTop =
      item.offsetTop - column.clientHeight / 2 + item.clientHeight / 2;
  });
  const first =
    columns[0]?.querySelector<HTMLElement>("[data-selected]") ??
    columns[0]?.querySelector<HTMLElement>("button");
  first?.focus({ preventScroll: true });
}

// Accepts "9", "930", "0930", "9:30", "9.30" → "09:30"; returns null if not a valid 24-hour time.
function parseTime(text: string) {
  const match = /^(\d{1,2})(?:[:.]?(\d{2}))?$/.exec(text);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2] ?? "0");
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function range(count: number) {
  return Array.from({ length: count }, (_, i) => String(i).padStart(2, "0"));
}

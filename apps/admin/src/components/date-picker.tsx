import { useState } from "react";
import { CalendarIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  calendarLocale,
  formatDate,
  parseIsoDate,
  toIsoDate,
} from "@/lib/date-format";
import { cn } from "@/lib/utils";

type DatePickerProps = {
  id?: string;
  // ISO "YYYY-MM-DD", or "" when nothing is picked
  value: string;
  onChange: (value: string) => void;
  min?: string;
  placeholder?: string;
  invalid?: boolean;
};

export function DatePicker({
  id,
  value,
  onChange,
  min,
  placeholder,
  invalid,
}: DatePickerProps) {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const selected = value ? parseIsoDate(value) : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          aria-invalid={invalid}
          className={cn(
            "w-full justify-between font-normal",
            !value && "text-muted-foreground",
          )}
        >
          {value ? formatDate(value) : (placeholder ?? "DD/MM/YYYY")}
          <CalendarIcon className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          locale={calendarLocale(i18n.language)}
          disabled={min ? { before: parseIsoDate(min) } : undefined}
          onSelect={(date) => {
            if (!date) return;
            onChange(toIsoDate(date));
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

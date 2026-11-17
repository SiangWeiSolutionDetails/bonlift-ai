import { useEffect, useRef, type ComponentProps } from "react";
import type { CheckState } from "../permission-selection";

type TriStateCheckboxProps = Omit<ComponentProps<"input">, "type" | "checked"> & {
  checked: CheckState;
};

export function TriStateCheckbox({ checked, ...props }: TriStateCheckboxProps) {
  const ref = useRef<HTMLInputElement>(null);
  const indeterminate = checked === "indeterminate";

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <input
      {...props}
      ref={ref}
      type="checkbox"
      checked={checked === true}
      aria-checked={indeterminate ? "mixed" : checked}
    />
  );
}

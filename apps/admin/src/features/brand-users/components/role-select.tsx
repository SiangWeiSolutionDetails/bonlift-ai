import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { RoleOption } from "../use-role-options";

type RoleSelectProps = {
  id: string;
  value: string;
  options: RoleOption[];
  placeholder?: string;
  disabled: boolean;
  onChange: (roleId: string) => void;
};

export function RoleSelect({ id, value, options, placeholder, disabled, onChange }: RoleSelectProps) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((role) => (
          <SelectItem key={role.id} value={role.id}>
            {role.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

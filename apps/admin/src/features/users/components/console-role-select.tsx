import { useTranslation } from "react-i18next";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCurrentUser } from "@/features/auth/queries";
import { useRoles } from "@/features/roles/queries";
import { CONSOLE_SCOPE, type Role } from "@/features/roles/type";

const NO_ROLE = "none";

type HeldRole = { id: string; name: string };

// The built-in Admin role is only offered to Admins; a held role the viewer can't offer still shows
function consoleRoleOptions(roles: Role[], isAdmin: boolean, heldRole: HeldRole | null) {
  const options: { id: string; name: string; disabled?: boolean }[] = roles.filter(
    (role) => !role.isBuiltin || isAdmin,
  );
  if (heldRole && !options.some((role) => role.id === heldRole.id)) {
    options.push({ id: heldRole.id, name: heldRole.name, disabled: true });
  }
  return options;
}

type ConsoleRoleSelectProps = {
  id: string;
  value: string | null;
  heldRole?: HeldRole | null;
  disabled: boolean;
  onChange: (roleId: string | null) => void;
};

export function ConsoleRoleSelect({
  id,
  value,
  heldRole = null,
  disabled,
  onChange,
}: ConsoleRoleSelectProps) {
  const { t } = useTranslation("users");
  const isAdmin = useCurrentUser().console?.isAdmin ?? false;
  const { data: roles = [] } = useRoles(CONSOLE_SCOPE);

  return (
    <Select
      value={value ?? NO_ROLE}
      onValueChange={(next) => onChange(next === NO_ROLE ? null : next)}
      disabled={disabled}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_ROLE}>{t("table.noRole")}</SelectItem>
        {consoleRoleOptions(roles, isAdmin, heldRole).map((role) => (
          <SelectItem key={role.id} value={role.id} disabled={role.disabled}>
            {role.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

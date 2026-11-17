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
import { useChangeConsoleRole } from "../queries";
import type { UserRecord } from "../type";

const NO_ROLE = "none";

type ConsoleRoleSelectProps = {
  user: UserRecord;
  disabled: boolean;
  onError: (error: Error | null) => void;
};

export function ConsoleRoleSelect({ user, disabled, onError }: ConsoleRoleSelectProps) {
  const { t } = useTranslation("users");
  const isAdmin = useCurrentUser().console?.isAdmin ?? false;
  const { data: roles = [] } = useRoles("console");
  const mutation = useChangeConsoleRole();
  const options = roles.filter((role) => !role.isBuiltin || isAdmin);

  function change(value: string) {
    onError(null);
    mutation.mutate(
      { userId: user.id, roleId: value === NO_ROLE ? null : value },
      { onError },
    );
  }

  return (
    <Select
      value={user.consoleRole?.id ?? NO_ROLE}
      onValueChange={change}
      disabled={disabled || mutation.isPending}
    >
      <SelectTrigger size="sm" aria-label={t("table.consoleRoleFor", { email: user.email })}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_ROLE}>{t("table.noRole")}</SelectItem>
        {options.map((role) => (
          <SelectItem key={role.id} value={role.id}>
            {role.name}
          </SelectItem>
        ))}
        {user.consoleRole && !options.some((role) => role.id === user.consoleRole?.id) && (
          <SelectItem value={user.consoleRole.id} disabled>
            {user.consoleRole.name}
          </SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}

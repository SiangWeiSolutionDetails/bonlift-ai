import { usePermissions } from "@/features/auth/permissions";
import { RolesView } from "@/features/roles/components/roles-view";
import { CONSOLE_SCOPE } from "@/features/roles/type";

export function RolesPage() {
  const { canConsole } = usePermissions();
  return <RolesView scope={CONSOLE_SCOPE} canManage={canConsole("roles.manage")} />;
}

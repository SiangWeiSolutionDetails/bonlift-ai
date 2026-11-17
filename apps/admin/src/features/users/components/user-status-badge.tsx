import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";

export type UserStatus = "invited" | "active" | "disabled";

const STATUS_VARIANT = {
  active: "success",
  invited: "warning",
  disabled: "destructive",
} as const;

export function UserStatusBadge({ status }: { status: UserStatus }) {
  const { t } = useTranslation("users");
  return <Badge variant={STATUS_VARIANT[status]}>{t(`status.${status}`)}</Badge>;
}

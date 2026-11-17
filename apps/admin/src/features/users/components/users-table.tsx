import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/date-format";
import { getErrorMessage } from "@/lib/error-message";
import { cn } from "@/lib/utils";
import type { UserRecord } from "../type";
import { UserStatusBadge } from "./user-status-badge";

const COLUMN_COUNT = 7;
const SKELETON_ROW_COUNT = 3;

type UsersTableProps = {
  users: UserRecord[] | undefined;
  emptyMessage?: string;
  isPending: boolean;
  error: Error | null;
  currentUserId: string;
  currentUserIsAdmin: boolean;
  canInvite: boolean;
  canDisable: boolean;
  canDelete: boolean;
  canEdit: boolean;
  isBusy: boolean;
  onEdit: (user: UserRecord) => void;
  onReinvite: (user: UserRecord) => void;
  onDisable: (user: UserRecord) => void;
  onDelete: (user: UserRecord) => void;
};

export function UsersTable(props: UsersTableProps) {
  const { t } = useTranslation("users");

  return (
    <div className="overflow-hidden rounded-xl bg-card shadow-panel">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("table.email")}</TableHead>
            <TableHead>{t("table.name")}</TableHead>
            <TableHead className="w-28">{t("table.status")}</TableHead>
            <TableHead className="w-48">{t("table.consoleRole")}</TableHead>
            <TableHead className="w-24">{t("table.brands")}</TableHead>
            <TableHead className="w-48">{t("table.lastLogin")}</TableHead>
            <TableHead className="w-64 text-right">
              <span className="sr-only">{t("table.rowActions")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <UsersTableRows {...props} />
        </TableBody>
      </Table>
    </div>
  );
}

function UsersTableRows({
  users,
  emptyMessage,
  isPending,
  error,
  currentUserId,
  currentUserIsAdmin,
  canInvite,
  canDisable,
  canDelete,
  canEdit,
  isBusy,
  onEdit,
  onReinvite,
  onDisable,
  onDelete,
}: UsersTableProps) {
  const { t } = useTranslation("users");
  const { t: tCommon } = useTranslation();

  if (isPending) {
    return Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
      <TableRow key={index}>
        <TableCell colSpan={COLUMN_COUNT}>
          <Skeleton className="h-5 w-full" />
        </TableCell>
      </TableRow>
    ));
  }

  if (error) {
    return <MessageRow className="text-destructive">{getErrorMessage(error, tCommon)}</MessageRow>;
  }

  if (!users?.length) {
    return <MessageRow>{emptyMessage ?? t("table.empty")}</MessageRow>;
  }

  return users.map((user) => {
    const isSelf = user.id.toLowerCase() === currentUserId.toLowerCase();
    const isLocked = isSelf || (!!user.consoleRole?.isBuiltin && !currentUserIsAdmin);
    const isDisabled = user.status === "disabled";
    const lockHint = isSelf ? t("table.ownRow") : undefined;
    return (
      <TableRow key={user.id}>
        <TableCell className="font-medium">{user.email}</TableCell>
        <TableCell>{user.displayName ?? "-"}</TableCell>
        <TableCell>
          <UserStatusBadge status={user.status} />
        </TableCell>
        <TableCell>{user.consoleRole?.name ?? t("table.noRole")}</TableCell>
        <TableCell>{user.brandCount}</TableCell>
        <TableCell>{user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "-"}</TableCell>
        <TableCell className="text-right">
          {!isDisabled && (
            <Button
              variant="ghost"
              size="sm"
              aria-label={t(canEdit ? "table.editUser" : "table.viewUser", { email: user.email })}
              onClick={() => onEdit(user)}
            >
              {tCommon(canEdit ? "actions.edit" : "actions.view")}
            </Button>
          )}
          {canInvite && isDisabled && (
            <Button
              variant="ghost"
              size="sm"
              disabled={isLocked || isBusy}
              title={lockHint}
              aria-label={t("table.reinviteUser", { email: user.email })}
              onClick={() => onReinvite(user)}
            >
              {t("table.reinvite")}
            </Button>
          )}
          {canDisable && !isDisabled && (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              disabled={isLocked || isBusy}
              title={lockHint}
              aria-label={t("table.disableUser", { email: user.email })}
              onClick={() => onDisable(user)}
            >
              {t("table.disable")}
            </Button>
          )}
          {canDelete && isDisabled && (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              disabled={isLocked || isBusy}
              title={lockHint}
              aria-label={t("table.deleteUser", { email: user.email })}
              onClick={() => onDelete(user)}
            >
              {t("table.delete")}
            </Button>
          )}
        </TableCell>
      </TableRow>
    );
  });
}

function MessageRow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <TableRow>
      <TableCell
        colSpan={COLUMN_COUNT}
        className={cn("h-24 text-center text-muted-foreground", className)}
      >
        {children}
      </TableCell>
    </TableRow>
  );
}

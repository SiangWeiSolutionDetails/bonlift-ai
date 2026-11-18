import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
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
import { getErrorMessage } from "@/lib/error-message";
import { cn } from "@/lib/utils";
import { isWithinLimit } from "../role-access";
import type { Role } from "../type";

const COLUMN_COUNT = 4;
const SKELETON_ROW_COUNT = 3;

type RolesTableProps = {
  roles: Role[] | undefined;
  emptyMessage?: string;
  isPending: boolean;
  error: Error | null;
  heldRoleIds: ReadonlySet<string>;
  grantLimit: ReadonlySet<string>;
  onEdit?: (role: Role) => void;
  onView: (role: Role) => void;
  onDelete?: (role: Role) => void;
};

export function RolesTable(props: RolesTableProps) {
  const { t } = useTranslation("roles");

  return (
    <div className="overflow-hidden rounded-xl bg-card shadow-panel">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("table.name")}</TableHead>
            <TableHead className="w-28">{t("table.actions")}</TableHead>
            <TableHead className="w-28">{t("table.assignments")}</TableHead>
            <TableHead className="w-48 text-right">
              <span className="sr-only">{t("table.rowActions")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <RolesTableRows {...props} />
        </TableBody>
      </Table>
    </div>
  );
}

function RolesTableRows({
  roles,
  emptyMessage,
  isPending,
  error,
  heldRoleIds,
  grantLimit,
  onEdit,
  onView,
  onDelete,
}: RolesTableProps) {
  const { t } = useTranslation("roles");
  const { t: tCommon } = useTranslation();

  // The API refuses changing a role the actor holds, or one with actions beyond what they may grant
  function lockHintFor(role: Role) {
    if (heldRoleIds.has(role.id)) return t("table.ownRole");
    if (!isWithinLimit(role.actions, grantLimit)) return t("table.beyondLimit");
    return undefined;
  }

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

  if (!roles?.length) {
    return <MessageRow>{emptyMessage ?? t("table.empty")}</MessageRow>;
  }

  return roles.map((role) => {
    const lockHint = role.isBuiltin ? undefined : lockHintFor(role);
    const isLocked = role.isBuiltin || lockHint !== undefined;
    return (
      <TableRow key={role.id}>
        <TableCell className="font-medium">
          {role.name}
          {role.isBuiltin && (
            <Badge variant="secondary" className="ml-2">
              {t("table.builtin")}
            </Badge>
          )}
        </TableCell>
        <TableCell>{role.isBuiltin ? t("table.allActions") : role.actions.length}</TableCell>
        <TableCell>{role.assignmentCount}</TableCell>
        <TableCell className="text-right">
          {onEdit && (
            <Button
              variant="ghost"
              size="sm"
              disabled={isLocked}
              title={lockHint}
              aria-label={t("table.editRole", { name: role.name })}
              onClick={() => onEdit(role)}
            >
              {tCommon("actions.edit")}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            aria-label={t("table.viewRole", { name: role.name })}
            onClick={() => onView(role)}
          >
            {tCommon("actions.view")}
          </Button>
          {onDelete && (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              disabled={isLocked}
              title={lockHint}
              aria-label={t("table.deleteRole", { name: role.name })}
              onClick={() => onDelete(role)}
            >
              {tCommon("actions.delete")}
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

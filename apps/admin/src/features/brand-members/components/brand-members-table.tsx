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
import { getErrorMessage } from "@/lib/error-message";
import { cn } from "@/lib/utils";
import type { BrandMember } from "../type";

const COLUMN_COUNT = 4;
const SKELETON_ROW_COUNT = 3;

type BrandMembersTableProps = {
  members: BrandMember[] | undefined;
  isPending: boolean;
  error: Error | null;
  currentUserId: string;
  isBusy: boolean;
  onEdit?: (member: BrandMember) => void;
  onRemove?: (member: BrandMember) => void;
};

export function BrandMembersTable(props: BrandMembersTableProps) {
  const { t } = useTranslation("brands");

  return (
    <div className="overflow-hidden rounded-xl bg-card shadow-panel">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("members.name")}</TableHead>
            <TableHead>{t("members.email")}</TableHead>
            <TableHead className="w-48">{t("members.role")}</TableHead>
            <TableHead className="w-48 text-right">
              <span className="sr-only">{t("members.rowActions")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <BrandMembersTableRows {...props} />
        </TableBody>
      </Table>
    </div>
  );
}

function BrandMembersTableRows({
  members,
  isPending,
  error,
  currentUserId,
  isBusy,
  onEdit,
  onRemove,
}: BrandMembersTableProps) {
  const { t } = useTranslation("brands");
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

  if (!members?.length) {
    return <MessageRow>{t("members.empty")}</MessageRow>;
  }

  return members.map((member) => {
    const isSelf = member.userId.toLowerCase() === currentUserId.toLowerCase();
    const label = member.displayName ?? member.email;
    const lockHint = isSelf ? t("members.ownRow") : undefined;
    return (
      <TableRow key={member.userId}>
        <TableCell className="font-medium">{member.displayName ?? "-"}</TableCell>
        <TableCell>{member.email}</TableCell>
        <TableCell>{member.roleName}</TableCell>
        <TableCell className="text-right">
          {onEdit && (
            <Button
              variant="ghost"
              size="sm"
              disabled={isSelf || isBusy}
              title={lockHint}
              aria-label={t("members.editNamed", { name: label })}
              onClick={() => onEdit(member)}
            >
              {tCommon("actions.edit")}
            </Button>
          )}
          {onRemove && (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              disabled={isSelf || isBusy}
              title={lockHint}
              aria-label={t("members.removeNamed", { name: label })}
              onClick={() => onRemove(member)}
            >
              {t("members.remove")}
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

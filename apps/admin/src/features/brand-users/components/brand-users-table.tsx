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
import type { BrandUser } from "../type";

const COLUMN_COUNT = 4;
const SKELETON_ROW_COUNT = 3;

type BrandUsersTableProps = {
  brandUsers: BrandUser[] | undefined;
  isPending: boolean;
  error: Error | null;
  currentUserId: string;
  isBusy: boolean;
  onEdit?: (brandUser: BrandUser) => void;
  onRemove?: (brandUser: BrandUser) => void;
};

export function BrandUsersTable(props: BrandUsersTableProps) {
  const { t } = useTranslation("brands");

  return (
    <div className="overflow-hidden rounded-xl bg-card shadow-panel">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("users.name")}</TableHead>
            <TableHead>{t("users.email")}</TableHead>
            <TableHead className="w-48">{t("users.role")}</TableHead>
            <TableHead className="w-48 text-right">
              <span className="sr-only">{t("users.rowActions")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <BrandUsersTableRows {...props} />
        </TableBody>
      </Table>
    </div>
  );
}

function BrandUsersTableRows({
  brandUsers,
  isPending,
  error,
  currentUserId,
  isBusy,
  onEdit,
  onRemove,
}: BrandUsersTableProps) {
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

  if (!brandUsers?.length) {
    return <MessageRow>{t("users.empty")}</MessageRow>;
  }

  return brandUsers.map((brandUser) => {
    const isSelf = brandUser.userId.toLowerCase() === currentUserId.toLowerCase();
    const label = brandUser.displayName ?? brandUser.email;
    const lockHint = isSelf ? t("users.ownRow") : undefined;
    return (
      <TableRow key={brandUser.userId}>
        <TableCell className="font-medium">{brandUser.displayName ?? "-"}</TableCell>
        <TableCell>{brandUser.email}</TableCell>
        <TableCell>{brandUser.roleName}</TableCell>
        <TableCell className="text-right">
          {onEdit && (
            <Button
              variant="ghost"
              size="sm"
              disabled={isSelf || isBusy}
              title={lockHint}
              aria-label={t("users.editNamed", { name: label })}
              onClick={() => onEdit(brandUser)}
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
              aria-label={t("users.removeNamed", { name: label })}
              onClick={() => onRemove(brandUser)}
            >
              {t("users.remove")}
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

import type { ReactNode } from "react";
import { CircleCheckIcon } from "lucide-react";
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
import type { Outlet } from "../type";
import { CopyOutletIdButton } from "./copy-outlet-id-button";

const COLUMN_COUNT = 3;
const SKELETON_ROW_COUNT = 5;

type OutletsTableProps = {
  outlets: Outlet[] | undefined;
  isPending: boolean;
  error: Error | null;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (outlet: Outlet) => void;
  onView: (outlet: Outlet) => void;
  onDelete: (outlet: Outlet) => void;
  emptyMessage?: string;
};

export function OutletsTable(props: OutletsTableProps) {
  const { t } = useTranslation("outlets");

  return (
    <div className="overflow-hidden rounded-xl bg-card shadow-panel">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("table.name")}</TableHead>
            <TableHead className="w-32">{t("table.status")}</TableHead>
            <TableHead className="w-64 text-right">
              <span className="sr-only">{t("table.actions")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <OutletsTableRows {...props} />
        </TableBody>
      </Table>
    </div>
  );
}

function OutletsTableRows({
  outlets,
  isPending,
  error,
  canEdit,
  canDelete,
  onEdit,
  onView,
  onDelete,
  emptyMessage,
}: OutletsTableProps) {
  const { t } = useTranslation("outlets");
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

  if (!outlets?.length) {
    return <MessageRow>{emptyMessage ?? t("table.empty")}</MessageRow>;
  }

  return outlets.map((outlet) => (
    <TableRow key={outlet.id}>
      <TableCell className="font-medium">{outlet.name}</TableCell>
      <TableCell>
        <Badge variant={outlet.isActive ? "success" : "secondary"}>
          {outlet.isActive && <CircleCheckIcon />}
          {outlet.isActive ? tCommon("status.active") : tCommon("status.inactive")}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        <CopyOutletIdButton outlet={outlet} />
        {canEdit && (
          <Button
            variant="ghost"
            size="sm"
            aria-label={t("table.editOutlet", { name: outlet.name })}
            onClick={() => onEdit(outlet)}
          >
            {tCommon("actions.edit")}
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          aria-label={t("table.viewOutlet", { name: outlet.name })}
          onClick={() => onView(outlet)}
        >
          {tCommon("actions.view")}
        </Button>
        {canDelete && (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            aria-label={t("table.deleteOutlet", { name: outlet.name })}
            onClick={() => onDelete(outlet)}
          >
            {tCommon("actions.delete")}
          </Button>
        )}
      </TableCell>
    </TableRow>
  ));
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

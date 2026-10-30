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
import type { Tenant } from "../type";

const COLUMN_COUNT = 3;
const SKELETON_ROW_COUNT = 5;

type TenantsTableProps = {
  tenants: Tenant[] | undefined;
  isPending: boolean;
  error: Error | null;
  onEdit: (tenant: Tenant) => void;
  onView: (tenant: Tenant) => void;
};

export function TenantsTable(props: TenantsTableProps) {
  const { t } = useTranslation("tenants");

  return (
    <div className="overflow-hidden rounded-xl bg-card shadow-panel">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("table.name")}</TableHead>
            <TableHead className="w-32">{t("table.status")}</TableHead>
            <TableHead className="w-24 text-right">
              <span className="sr-only">{t("table.actions")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TenantsTableRows {...props} />
        </TableBody>
      </Table>
    </div>
  );
}

function TenantsTableRows({ tenants, isPending, error, onEdit, onView }: TenantsTableProps) {
  const { t } = useTranslation("tenants");
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

  if (!tenants?.length) {
    return <MessageRow>{t("table.empty")}</MessageRow>;
  }

  return tenants.map((tenant) => (
    <TableRow key={tenant.id}>
      <TableCell className="font-medium">{tenant.name}</TableCell>
      <TableCell>
        <Badge variant={tenant.isActive ? "success" : "secondary"}>
          {tenant.isActive && <CircleCheckIcon />}
          {tenant.isActive ? tCommon("status.active") : tCommon("status.inactive")}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        <Button
          variant="ghost"
          size="sm"
          aria-label={t("table.editTenant", { name: tenant.name })}
          onClick={() => onEdit(tenant)}
        >
          {tCommon("actions.edit")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-label={t("table.viewTenant", { name: tenant.name })}
          onClick={() => onView(tenant)}
        >
          {tCommon("actions.view")}
        </Button>
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

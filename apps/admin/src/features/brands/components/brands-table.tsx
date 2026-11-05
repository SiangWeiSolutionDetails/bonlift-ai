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
import type { Tenant } from "@/features/tenants/type";
import type { Brand } from "../type";

const COLUMN_COUNT = 4;
const SKELETON_ROW_COUNT = 5;

type BrandsTableProps = {
  brands: Brand[] | undefined;
  tenants: Tenant[];
  isPending: boolean;
  error: Error | null;
  onEdit: (brand: Brand) => void;
  onView: (brand: Brand) => void;
  onDelete: (brand: Brand) => void;
};

export function BrandsTable(props: BrandsTableProps) {
  const { t } = useTranslation("brands");

  return (
    <div className="overflow-hidden rounded-xl bg-card shadow-panel">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("table.name")}</TableHead>
            <TableHead>{t("table.tenant")}</TableHead>
            <TableHead className="w-32">{t("table.status")}</TableHead>
            <TableHead className="w-40 text-right">
              <span className="sr-only">{t("table.actions")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <BrandsTableRows {...props} />
        </TableBody>
      </Table>
    </div>
  );
}

function BrandsTableRows({
  brands,
  tenants,
  isPending,
  error,
  onEdit,
  onView,
  onDelete,
}: BrandsTableProps) {
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

  if (!brands?.length) {
    return <MessageRow>{t("table.empty")}</MessageRow>;
  }

  const tenantNames = new Map(tenants.map((tenant) => [tenant.id, tenant.name]));

  return brands.map((brand) => (
    <TableRow key={brand.id}>
      <TableCell className="font-medium">{brand.name}</TableCell>
      <TableCell className="text-muted-foreground">
        {tenantNames.get(brand.tenantId) ?? "—"}
      </TableCell>
      <TableCell>
        <Badge variant={brand.isActive ? "success" : "secondary"}>
          {brand.isActive && <CircleCheckIcon />}
          {brand.isActive ? tCommon("status.active") : tCommon("status.inactive")}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        <Button
          variant="ghost"
          size="sm"
          aria-label={t("table.editBrand", { name: brand.name })}
          onClick={() => onEdit(brand)}
        >
          {tCommon("actions.edit")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-label={t("table.viewBrand", { name: brand.name })}
          onClick={() => onView(brand)}
        >
          {tCommon("actions.view")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          aria-label={t("table.deleteBrand", { name: brand.name })}
          onClick={() => onDelete(brand)}
        >
          {tCommon("actions.delete")}
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

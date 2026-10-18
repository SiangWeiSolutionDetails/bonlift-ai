import { useMemo, type ReactNode } from "react";
import { EyeIcon, PencilIcon } from "lucide-react";
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
import type { Brand } from "@/features/brands/type";
import { getErrorMessage } from "@/lib/error-message";
import { cn } from "@/lib/utils";
import type { Outlet } from "../type";

const COLUMN_COUNT = 4;
const SKELETON_ROW_COUNT = 5;

type OutletsTableProps = {
  outlets: Outlet[] | undefined;
  brands: Brand[];
  isPending: boolean;
  error: Error | null;
  onEdit: (outlet: Outlet) => void;
  onView: (outlet: Outlet) => void;
};

export function OutletsTable(props: OutletsTableProps) {
  const { t } = useTranslation("outlets");

  return (
    <div className="overflow-hidden rounded-xl bg-card shadow-panel">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("table.name")}</TableHead>
            <TableHead>{t("table.brand")}</TableHead>
            <TableHead className="w-32">{t("table.status")}</TableHead>
            <TableHead className="w-24 text-right">
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
  brands,
  isPending,
  error,
  onEdit,
  onView,
}: OutletsTableProps) {
  const { t } = useTranslation("outlets");
  const { t: tCommon } = useTranslation();
  // O(1) lookup per row instead of scanning the brand list for every outlet
  const brandNameById = useMemo(
    () => new Map(brands.map((brand) => [brand.id, brand.name])),
    [brands],
  );

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
    return <MessageRow>{t("table.empty")}</MessageRow>;
  }

  return outlets.map((outlet) => (
    <TableRow key={outlet.id}>
      <TableCell className="font-medium">{outlet.name}</TableCell>
      <TableCell className="text-muted-foreground">
        {brandNameById.get(outlet.brandId) ?? t("table.unknownBrand")}
      </TableCell>
      <TableCell>
        <Badge variant={outlet.isActive ? "success" : "secondary"}>
          {outlet.isActive ? tCommon("status.active") : tCommon("status.inactive")}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("table.editOutlet", { name: outlet.name })}
          onClick={() => onEdit(outlet)}
        >
          <PencilIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("table.viewOutlet", { name: outlet.name })}
          onClick={() => onView(outlet)}
        >
          <EyeIcon />
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

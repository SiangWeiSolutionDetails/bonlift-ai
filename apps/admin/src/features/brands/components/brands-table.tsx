import type { ReactNode } from "react";
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
import { getErrorMessage } from "@/lib/error-message";
import { cn } from "@/lib/utils";
import type { Brand } from "../type";

const COLUMN_COUNT = 3;
const SKELETON_ROW_COUNT = 5;

type BrandsTableProps = {
  brands: Brand[] | undefined;
  isPending: boolean;
  error: Error | null;
  onEdit: (brand: Brand) => void;
  onView: (brand: Brand) => void;
};

export function BrandsTable(props: BrandsTableProps) {
  const { t } = useTranslation("brands");

  return (
    <div className="overflow-hidden rounded-xl bg-card shadow-xs ring-1 ring-foreground/5">
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
          <BrandsTableRows {...props} />
        </TableBody>
      </Table>
    </div>
  );
}

function BrandsTableRows({ brands, isPending, error, onEdit, onView }: BrandsTableProps) {
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

  return brands.map((brand) => (
    <TableRow key={brand.id}>
      <TableCell className="font-medium">{brand.name}</TableCell>
      <TableCell>
        <Badge variant={brand.isActive ? "success" : "secondary"}>
          {brand.isActive ? tCommon("status.active") : tCommon("status.inactive")}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("table.editBrand", { name: brand.name })}
          onClick={() => onEdit(brand)}
        >
          <PencilIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("table.viewBrand", { name: brand.name })}
          onClick={() => onView(brand)}
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

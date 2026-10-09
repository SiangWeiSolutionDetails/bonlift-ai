import type { ReactNode } from "react";
import { PencilIcon } from "lucide-react";
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
import { cn } from "@/lib/utils";
import type { Brand } from "../type";

const COLUMN_COUNT = 3;
const SKELETON_ROW_COUNT = 5;

type BrandsTableProps = {
  brands: Brand[] | undefined;
  isPending: boolean;
  error: Error | null;
  onEdit: (brand: Brand) => void;
};

export function BrandsTable(props: BrandsTableProps) {
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead className="w-32">Status</TableHead>
            <TableHead className="w-16 text-right">
              <span className="sr-only">Actions</span>
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

function BrandsTableRows({ brands, isPending, error, onEdit }: BrandsTableProps) {
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
    return <MessageRow className="text-destructive">{error.message}</MessageRow>;
  }

  if (!brands?.length) {
    return <MessageRow>No brands yet.</MessageRow>;
  }

  return brands.map((brand) => (
    <TableRow key={brand.id}>
      <TableCell className="font-medium">{brand.name}</TableCell>
      <TableCell>
        <Badge variant={brand.isActive ? "default" : "secondary"}>
          {brand.isActive ? "Active" : "Inactive"}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Edit ${brand.name}`}
          onClick={() => onEdit(brand)}
        >
          <PencilIcon />
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

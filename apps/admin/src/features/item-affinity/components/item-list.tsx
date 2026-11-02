import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { getErrorMessage } from "@/lib/error-message";
import { cn } from "@/lib/utils";
import { useRunItems } from "../queries";
import type { AffinityItem } from "../type";

type ItemListProps = {
  runId: string;
  selectedItemId: string | undefined;
  onSelect: (itemId: string) => void;
};

function matchesSearch(item: AffinityItem, search: string) {
  return (
    item.itemId.toLowerCase().includes(search) ||
    (item.itemName?.toLowerCase().includes(search) ?? false)
  );
}

export function ItemList({ runId, selectedItemId, onSelect }: ItemListProps) {
  const { t } = useTranslation("itemAffinity");
  const { t: tCommon } = useTranslation();
  const [searchText, setSearchText] = useState("");
  const items = useRunItems(runId);

  const search = searchText.trim().toLowerCase();
  const rows = (items.data ?? []).filter((item) => matchesSearch(item, search));

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <Input
        type="search"
        aria-label={t("items.search")}
        placeholder={t("items.search")}
        value={searchText}
        onChange={(event) => setSearchText(event.target.value)}
      />

      {items.isPending && <Skeleton className="h-40 w-full" />}

      {items.error && (
        <p className="text-sm text-destructive">
          {getErrorMessage(items.error, tCommon)}
        </p>
      )}

      {items.isSuccess && rows.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {t("items.empty")}
        </p>
      )}

      {rows.length > 0 && (
        // minmax(0, 1fr) lets a long item name truncate instead of widening the list
        <ul className="grid max-h-48 min-h-0 grid-cols-[minmax(0,1fr)] content-start gap-1 overflow-y-auto rounded-xl border p-1 xl:max-h-none xl:flex-1">
          {rows.map((item) => (
            <li key={item.itemId}>
              <button
                type="button"
                aria-current={item.itemId === selectedItemId}
                onClick={() => onSelect(item.itemId)}
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted",
                  item.itemId === selectedItemId && "bg-primary/10 font-medium",
                )}
              >
                <span
                  className="min-w-0 truncate"
                  title={item.itemName ?? item.itemId}
                >
                  {item.itemName ?? item.itemId}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {t("items.orderCount", { count: item.nOrders })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

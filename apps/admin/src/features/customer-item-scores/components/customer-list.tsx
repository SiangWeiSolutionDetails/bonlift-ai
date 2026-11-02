import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { getErrorMessage } from "@/lib/error-message";
import { cn } from "@/lib/utils";
import { useRunCustomers } from "../queries";

const SEARCH_DEBOUNCE_MS = 300;

type CustomerListProps = {
  runId: string;
  selectedCustomerId: string | undefined;
  onSelect: (customerId: string) => void;
};

export function CustomerList({
  runId,
  selectedCustomerId,
  onSelect,
}: CustomerListProps) {
  const { t } = useTranslation("customerScores");
  const { t: tCommon } = useTranslation();
  const [searchText, setSearchText] = useState("");
  const [search, setSearch] = useState<string | undefined>();

  useEffect(() => {
    const timer = setTimeout(
      () => setSearch(searchText.trim() || undefined),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [searchText]);

  const customers = useRunCustomers(runId, search);
  const rows = customers.data?.pages.flatMap((page) => page.customers) ?? [];

  return (
    <div className="grid content-start gap-3">
      <Input
        type="search"
        aria-label={t("customers.search")}
        placeholder={t("customers.search")}
        value={searchText}
        onChange={(event) => setSearchText(event.target.value)}
      />

      {customers.isPending && <Skeleton className="h-40 w-full" />}

      {customers.error && (
        <p className="text-sm text-destructive">
          {getErrorMessage(customers.error, tCommon)}
        </p>
      )}

      {customers.isSuccess && rows.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {t("customers.empty")}
        </p>
      )}

      {rows.length > 0 && (
        <ul className="grid max-h-48 gap-1 xl:max-h-96 overflow-y-auto rounded-xl border p-1">
          {rows.map((customer) => (
            <li key={customer.customerId}>
              <button
                type="button"
                aria-current={customer.customerId === selectedCustomerId}
                onClick={() => onSelect(customer.customerId)}
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted",
                  customer.customerId === selectedCustomerId && "bg-primary/10 font-medium",
                )}
              >
                <span className="min-w-0 truncate" title={customer.customerId}>
                  {customer.customerId}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {t("customers.itemCount", { count: customer.itemCount })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {customers.hasNextPage && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={customers.isFetchingNextPage}
          onClick={() => customers.fetchNextPage()}
        >
          {t("customers.loadMore")}
        </Button>
      )}
    </div>
  );
}

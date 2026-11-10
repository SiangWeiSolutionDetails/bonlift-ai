import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { normaliseCustomerId } from "@bonlift-ai/contracts";
import { FieldError } from "@/components/field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { getErrorMessage } from "@/lib/error-message";
import { cn } from "@/lib/utils";
import { shortCustomerId } from "../customer-id";
import { useRunCustomerSearch, useRunCustomers } from "../queries";

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
  const [isInvalid, setIsInvalid] = useState(false);

  // Sent only on submit and only when valid, with the same rules the API applies, so a partial number is never sent
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalised = normaliseCustomerId(searchText);
    setIsInvalid(normalised.status === "invalid");
    if (normalised.status === "valid") setSearch(normalised.value);
    if (normalised.status === "anonymous") setSearch(undefined);
  }

  function clearSearch() {
    setSearchText("");
    setSearch(undefined);
    setIsInvalid(false);
  }

  const list = useRunCustomers(runId);
  const found = useRunCustomerSearch(runId, search);
  const customers = search ? found : list;
  const rows = search
    ? (found.data?.customers ?? [])
    : (list.data?.pages.flatMap((page) => page.customers) ?? []);

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <form onSubmit={onSubmit} className="grid gap-1.5">
        <div className="flex gap-2">
          <Input
            type="search"
            aria-label={t("customers.search")}
            aria-invalid={isInvalid}
            aria-describedby="customer-search-hint"
            placeholder={t("customers.search")}
            value={searchText}
            onChange={(event) => {
              setSearchText(event.target.value);
              setIsInvalid(false);
            }}
          />
          <Button type="submit" variant="outline">
            {t("customers.find")}
          </Button>
          {search && (
            <Button type="button" variant="ghost" onClick={clearSearch}>
              {t("customers.clear")}
            </Button>
          )}
        </div>
        <p id="customer-search-hint" className="text-xs text-muted-foreground">
          {t("customers.searchHint")}
        </p>
        {isInvalid && <FieldError message={t("customers.searchInvalid")} />}
      </form>

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
        <ul className="grid max-h-48 min-h-0 content-start gap-1 overflow-y-auto rounded-xl border p-1 xl:max-h-none xl:flex-1">
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
                <span className="min-w-0 truncate font-mono text-xs" title={customer.customerId}>
                  {shortCustomerId(customer.customerId)}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {t("customers.itemCount", { count: customer.itemCount })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {!search && list.hasNextPage && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={list.isFetchingNextPage}
          onClick={() => list.fetchNextPage()}
        >
          {t("customers.loadMore")}
        </Button>
      )}
    </div>
  );
}

export type CustomerScoresSearch = {
  runId?: string;
  customerId?: string;
};

function optionalString(value: unknown) {
  return typeof value === "string" && value !== "" ? value : undefined;
}

// URL params are untrusted input: anything that isn't a non-empty string is dropped.
export function validateCustomerScoresSearch(
  search: Record<string, unknown>,
): CustomerScoresSearch {
  return {
    runId: optionalString(search.runId),
    customerId: optionalString(search.customerId),
  };
}

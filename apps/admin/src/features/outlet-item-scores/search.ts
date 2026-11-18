export type ResultsSearch = {
  outletId?: string;
  runId?: string;
};

function optionalString(value: unknown) {
  return typeof value === "string" && value !== "" ? value : undefined;
}

// URL params are untrusted input: anything that isn't a non-empty string is dropped.
export function validateResultsSearch(
  search: Record<string, unknown>,
): ResultsSearch {
  return {
    outletId: optionalString(search.outletId),
    runId: optionalString(search.runId),
  };
}

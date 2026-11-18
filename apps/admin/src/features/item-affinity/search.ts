export type ItemAffinitySearch = {
  runId?: string;
  itemId?: string;
};

function optionalString(value: unknown) {
  return typeof value === "string" && value !== "" ? value : undefined;
}

// URL params are untrusted input: anything that isn't a non-empty string is dropped.
export function validateItemAffinitySearch(
  search: Record<string, unknown>,
): ItemAffinitySearch {
  return {
    runId: optionalString(search.runId),
    itemId: optionalString(search.itemId),
  };
}

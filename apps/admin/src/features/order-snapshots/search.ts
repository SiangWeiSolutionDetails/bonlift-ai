export type SnapshotsSearch = {
  outletId?: string;
};

function optionalString(value: unknown) {
  return typeof value === "string" && value !== "" ? value : undefined;
}

// URL params are untrusted input: anything that isn't a non-empty string is dropped.
export function validateSnapshotsSearch(
  search: Record<string, unknown>,
): SnapshotsSearch {
  return {
    outletId: optionalString(search.outletId),
  };
}

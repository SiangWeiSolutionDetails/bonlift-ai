export type SnapshotsSearch = {
  brandId?: string;
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
    brandId: optionalString(search.brandId),
    outletId: optionalString(search.outletId),
  };
}

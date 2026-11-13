export type CalculationsSearch = {
  brandId?: string;
};

function optionalString(value: unknown) {
  return typeof value === "string" && value !== "" ? value : undefined;
}

// URL params are untrusted input: anything that isn't a non-empty string is dropped.
export function validateCalculationsSearch(search: Record<string, unknown>): CalculationsSearch {
  return {
    brandId: optionalString(search.brandId),
  };
}

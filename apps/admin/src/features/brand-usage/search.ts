export type UsageSearch = {
  brandId?: string;
  from?: string;
  to?: string;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function optionalString(value: unknown) {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function optionalIsoDate(value: unknown) {
  return typeof value === "string" && ISO_DATE.test(value) ? value : undefined;
}

// URL params are untrusted input: anything that isn't the expected shape is dropped, and the page falls back
// to its default range. A range with from after to is dropped as a whole.
export function validateUsageSearch(search: Record<string, unknown>): UsageSearch {
  const from = optionalIsoDate(search.from);
  const to = optionalIsoDate(search.to);
  const isRange = from !== undefined && to !== undefined && from <= to;

  return {
    brandId: optionalString(search.brandId),
    from: isRange ? from : undefined,
    to: isRange ? to : undefined,
  };
}

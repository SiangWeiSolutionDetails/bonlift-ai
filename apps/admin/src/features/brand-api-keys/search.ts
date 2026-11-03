export type ApiKeysSearch = {
  brandId?: string;
};

// URL params are untrusted input: anything that isn't a non-empty string is dropped.
export function validateApiKeysSearch(search: Record<string, unknown>): ApiKeysSearch {
  const { brandId } = search;
  return {
    brandId: typeof brandId === "string" && brandId !== "" ? brandId : undefined,
  };
}

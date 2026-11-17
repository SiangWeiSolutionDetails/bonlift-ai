import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { fetchMe } from "./api";

export const meQueryOptions = queryOptions({
  queryKey: ["auth", "me"] as const,
  queryFn: ({ signal }) => fetchMe(signal),
});

// The protected layout's beforeLoad has already loaded this, so it never suspends there
export function useCurrentUser() {
  return useSuspenseQuery(meQueryOptions).data;
}

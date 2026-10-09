import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./api-client";

const MAX_RETRIES = 1;

function shouldRetry(failureCount: number, error: Error) {
  // 4xx means the request itself is wrong; retrying gives the same answer
  if (error instanceof ApiError && error.status >= 400 && error.status < 500)
    return false;
  return failureCount < MAX_RETRIES;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: shouldRetry,
    },
  },
});

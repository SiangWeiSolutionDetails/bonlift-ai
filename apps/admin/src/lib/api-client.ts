type QueryValue = string | number | boolean | undefined;

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type RequestOptions = {
  method?: HttpMethod;
  body?: unknown;
  query?: Record<string, QueryValue>;
  signal?: AbortSignal;
};

type ApiErrorBody = {
  error?: string;
  message?: string;
};

const API_BASE = "/api";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

function buildUrl(path: string, query?: Record<string, QueryValue>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) params.append(key, String(value));
  }
  const queryString = params.toString();
  return `${API_BASE}${path}${queryString ? `?${queryString}` : ""}`;
}

async function toApiError(res: Response) {
  try {
    const body = (await res.json()) as ApiErrorBody;
    return new ApiError(
      res.status,
      body.error ?? "HTTP_ERROR",
      body.message ?? res.statusText,
    );
  } catch {
    // Non-JSON body, e.g. the Vite proxy's 502 when the API is down
    return new ApiError(
      res.status,
      "HTTP_ERROR",
      res.statusText || "Request failed",
    );
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = "GET", body, query, signal } = options;
  const hasBody = body !== undefined;

  let res: Response;

  try {
    res = await fetch(buildUrl(path, query), {
      method,
      signal,
      headers: hasBody ? { "Content-Type": "application/json" } : undefined,
      body: hasBody ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    // TanStack Query relies on AbortError propagating untouched to detect cancellation
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    throw new ApiError(0, "NETWORK_ERROR", "Unable to reach the server");
  }

  if (!res.ok) {
    throw await toApiError(res);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

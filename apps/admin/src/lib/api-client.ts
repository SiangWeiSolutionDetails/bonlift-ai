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

// Dev/pilot stopgap until admin login (H1): this token is baked into the bundle and visible to anyone who loads the SPA.
const ADMIN_TOKEN: string | undefined = import.meta.env.VITE_ADMIN_TOKEN;

if (import.meta.env.DEV && !ADMIN_TOKEN) {
  console.warn(
    "VITE_ADMIN_TOKEN is not set, so admin API requests will fail with 401. Set it in apps/admin/.env.local to the same value as ADMIN_TOKEN.",
  );
}

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

function buildHeaders(hasBody: boolean) {
  const headers: Record<string, string> = {};
  if (ADMIN_TOKEN) headers.Authorization = `Bearer ${ADMIN_TOKEN}`;
  if (hasBody) headers["Content-Type"] = "application/json";
  return headers;
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
      headers: buildHeaders(hasBody),
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

import type {
  AuthMeResponseSchemaType,
  AuthProvider,
  AuthProvidersResponseSchemaType,
} from "@bonlift-ai/contracts";
// Relative, not "@/": the root vitest config has no alias, and permissions.ts (unit-tested) imports this.
import { apiRequest } from "../../lib/api-client";

export async function fetchMe(signal?: AbortSignal) {
  return apiRequest<AuthMeResponseSchemaType>("/auth/me", { signal });
}

export async function fetchAuthProviders(signal?: AbortSignal) {
  return apiRequest<AuthProvidersResponseSchemaType>("/auth/providers", { signal });
}

// A full-page navigation, not a fetch: sign-in is a redirect to the identity provider and back
export function signInHref(
  provider: AuthProvider,
  returnTo: string,
  { selectAccount = false, loginHint }: { selectAccount?: boolean; loginHint?: string } = {},
) {
  const params = new URLSearchParams({ returnTo });
  if (selectAccount) params.set("selectAccount", "1");
  if (loginHint) params.set("loginHint", loginHint);
  return `/api/auth/login/${provider}?${params}`;
}

export async function logout() {
  return apiRequest<void>("/auth/logout", { method: "POST" });
}

export async function updateOwnName(displayName: string) {
  return apiRequest<AuthMeResponseSchemaType>("/auth/me", {
    method: "PATCH",
    body: { displayName },
  });
}

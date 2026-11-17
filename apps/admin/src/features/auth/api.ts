import type { AuthMeResponseSchemaType } from "@bonlift-ai/contracts";
// Relative, not "@/": the root vitest config has no alias, and permissions.ts (unit-tested) imports this.
import { apiRequest } from "../../lib/api-client";

export async function fetchMe(signal?: AbortSignal) {
  return apiRequest<AuthMeResponseSchemaType>("/auth/me", { signal });
}

export async function logout() {
  return apiRequest<void>("/auth/logout", { method: "POST" });
}

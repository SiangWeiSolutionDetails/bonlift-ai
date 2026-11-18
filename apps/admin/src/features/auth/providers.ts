import type { AuthProvider, AuthProvidersResponseSchemaType } from "@bonlift-ai/contracts";

export type ProviderButtonState = "loading" | "enabled" | "unavailable" | "error";

type ProvidersQuery = { status: "pending" | "error" | "success"; data?: AuthProvidersResponseSchemaType };

export function isProviderAvailable(data: AuthProvidersResponseSchemaType | undefined, provider: AuthProvider) {
  return data?.[provider] === true;
}

export function providerButtonState({ status, data }: ProvidersQuery, provider: AuthProvider): ProviderButtonState {
  if (status === "pending") return "loading";
  if (status === "error") return "error";
  return isProviderAvailable(data, provider) ? "enabled" : "unavailable";
}

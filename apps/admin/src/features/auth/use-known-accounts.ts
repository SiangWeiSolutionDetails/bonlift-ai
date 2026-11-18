import type { AuthProvider } from "@bonlift-ai/contracts";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import {
  parseKnownAccounts,
  readRawKnownAccounts,
  rememberAccount,
  subscribeKnownAccounts,
} from "./known-accounts";

export function useKnownAccounts() {
  const raw = useSyncExternalStore(subscribeKnownAccounts, readRawKnownAccounts, () => null);
  return useMemo(() => parseKnownAccounts(raw), [raw]);
}

export function useRememberCurrentAccount(email: string, displayName: string | null, provider: AuthProvider) {
  useEffect(() => {
    rememberAccount({ email, displayName, provider });
  }, [email, displayName, provider]);
}

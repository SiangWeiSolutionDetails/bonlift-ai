export type KnownAccount = { email: string; displayName: string | null; lastUsedAt: string };

const STORAGE_KEY = "bonlift.knownAccounts";
const MAX_ACCOUNTS = 5;

const listeners = new Set<() => void>();

const sameEmail = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

const newestFirst = (a: KnownAccount, b: KnownAccount) => b.lastUsedAt.localeCompare(a.lastUsedAt);

function isKnownAccount(value: unknown): value is KnownAccount {
  const v = value as Partial<KnownAccount> | null;
  return (
    typeof v === "object" &&
    v !== null &&
    typeof v.email === "string" &&
    v.email !== "" &&
    (v.displayName === null || typeof v.displayName === "string") &&
    typeof v.lastUsedAt === "string"
  );
}

export function parseKnownAccounts(raw: string | null): KnownAccount[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isKnownAccount)
      .map(({ email, displayName, lastUsedAt }) => ({ email, displayName, lastUsedAt }))
      .sort(newestFirst)
      .slice(0, MAX_ACCOUNTS);
  } catch {
    return [];
  }
}

export function upsertAccount(
  list: KnownAccount[],
  account: { email: string; displayName: string | null },
  now: Date,
): KnownAccount[] {
  const entry = { email: account.email, displayName: account.displayName, lastUsedAt: now.toISOString() };
  return [entry, ...list.filter((a) => !sameEmail(a.email, account.email))]
    .sort(newestFirst)
    .slice(0, MAX_ACCOUNTS);
}

export function removeAccount(list: KnownAccount[], email: string): KnownAccount[] {
  return list.filter((a) => !sameEmail(a.email, email));
}

export function readRawKnownAccounts(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function readKnownAccounts(): KnownAccount[] {
  return parseKnownAccounts(readRawKnownAccounts());
}

function writeKnownAccounts(list: KnownAccount[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // storage unavailable (private window); accounts just aren't remembered
  }
  listeners.forEach((listener) => listener());
}

export function subscribeKnownAccounts(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

export function rememberAccount(account: { email: string; displayName: string | null }) {
  writeKnownAccounts(upsertAccount(readKnownAccounts(), account, new Date()));
}

export function forgetAccount(email: string) {
  writeKnownAccounts(removeAccount(readKnownAccounts(), email));
}

const consoleEntry = <const G extends string, const K extends string>(group: G, key: K) =>
  ({ key, kind: "console", group, labelKey: `permissions:${key}` }) as const;
const brandEntry = <const G extends string, const K extends string>(group: G, key: K) =>
  ({ key, kind: "brand", group, labelKey: `permissions:${key}` }) as const;

export const PERMISSIONS = [
  consoleEntry("tenants", "tenants.view"),
  consoleEntry("tenants", "tenants.create"),
  consoleEntry("tenants", "tenants.edit"),
  consoleEntry("tenants", "tenants.delete"),
  consoleEntry("brands", "brands.view"),
  consoleEntry("brands", "brands.create"),
  consoleEntry("brands", "brands.edit"),
  consoleEntry("brands", "brands.delete"),
  consoleEntry("users", "users.view"),
  consoleEntry("users", "users.invite"),
  consoleEntry("users", "users.edit"),
  consoleEntry("users", "users.disable"),
  consoleEntry("users", "users.delete"),
  consoleEntry("users", "users.assignConsoleRoles"),
  consoleEntry("users", "users.assignBrandRoles"),
  consoleEntry("roles", "roles.view"),
  consoleEntry("roles", "roles.manage"),
  brandEntry("outlets", "outlets.view"),
  brandEntry("outlets", "outlets.create"),
  brandEntry("outlets", "outlets.edit"),
  brandEntry("outlets", "outlets.delete"),
  brandEntry("dataSource", "dataSource.view"),
  brandEntry("dataSource", "dataSource.edit"),
  brandEntry("snapshots", "snapshots.view"),
  brandEntry("snapshots", "snapshots.viewCustomerIds"),
  brandEntry("snapshots", "snapshots.upload"),
  brandEntry("calculations", "calculations.view"),
  brandEntry("calculations", "calculations.trigger"),
  brandEntry("calculations", "calculations.editSchedule"),
  brandEntry("calculations", "calculations.publish"),
  brandEntry("configs", "configs.view"),
  brandEntry("configs", "configs.edit"),
  brandEntry("results", "results.view"),
  brandEntry("customerScores", "customerScores.view"),
  brandEntry("itemAffinity", "itemAffinity.view"),
  brandEntry("channels", "channels.view"),
  brandEntry("channels", "channels.edit"),
  brandEntry("apiKeys", "apiKeys.view"),
  brandEntry("apiKeys", "apiKeys.create"),
  brandEntry("apiKeys", "apiKeys.revoke"),
  brandEntry("apiKeys", "apiKeys.delete"),
  brandEntry("usage", "usage.view"),
  brandEntry("feedback", "feedback.view"),
  brandEntry("members", "members.view"),
  brandEntry("members", "members.manage"),
] as const;

export type Permission = (typeof PERMISSIONS)[number];
export type PermissionKind = Permission["kind"];
export type ConsoleAction = Extract<Permission, { kind: "console" }>["key"];
export type BrandAction = Extract<Permission, { kind: "brand" }>["key"];

const keysOfKind = <K extends PermissionKind>(kind: K) =>
  PERMISSIONS.filter((p) => p.kind === kind).map((p) => p.key);

export const CONSOLE_ACTIONS = keysOfKind("console") as readonly ConsoleAction[];
export const BRAND_ACTIONS = keysOfKind("brand") as readonly BrandAction[];

export const PERMISSION_KEY_PATTERN = /^[a-z][A-Za-z]*\.[a-z][A-Za-z]*$/;

export const isConsoleAction = (key: string): key is ConsoleAction =>
  (CONSOLE_ACTIONS as readonly string[]).includes(key);

export const isBrandAction = (key: string): key is BrandAction =>
  (BRAND_ACTIONS as readonly string[]).includes(key);

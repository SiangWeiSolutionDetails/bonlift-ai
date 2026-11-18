import { useMemo } from "react";
import {
  isBrandAction,
  isConsoleAction,
  PERSONAL_DATA_ACTIONS,
  providerBrandActions,
  type AuthMeResponseSchemaType,
  type BrandAction,
  type ConsoleAction,
} from "@bonlift-ai/contracts";
// Relative, not "@/": the root vitest config has no alias, and this file is unit-tested.
import { useCurrentUser } from "./queries";

type Me = AuthMeResponseSchemaType;
export type MeBrand = Me["brands"][number];

// A page passes with any one of its actions (a brand page's on the workspace brand)
export type RouteAccess = { console: ConsoleAction | ConsoleAction[] } | { brand: BrandAction | BrandAction[] };

function consoleActions(me: Me): ConsoleAction[] {
  return (me.console?.actions ?? []).filter(isConsoleAction);
}

export function brandRoleActions(me: Me, brandId: string): BrandAction[] {
  return me.brands.find((b) => b.brandId === brandId)?.actions.filter(isBrandAction) ?? [];
}

// Provider grants apply on every brand, but never to personal data
export function providerActions(me: Me): BrandAction[] {
  return providerBrandActions(me.console?.actions ?? []).filter(
    (action) => !PERSONAL_DATA_ACTIONS.includes(action),
  );
}

export function holdsBrandRole(me: Me, brandId: string) {
  return me.brands.some((b) => b.brandId === brandId);
}

export function isProvider(me: Me) {
  return providerActions(me).length > 0;
}

export function canConsole(me: Me, action: ConsoleAction) {
  return consoleActions(me).includes(action);
}

export function canBrand(me: Me, brandId: string, action: BrandAction) {
  return [...brandRoleActions(me, brandId), ...providerActions(me)].includes(action);
}

export function hasAccess(me: Me, access: RouteAccess, brandId?: string) {
  if ("console" in access) return [access.console].flat().some((action) => canConsole(me, action));
  return !!brandId && [access.brand].flat().some((action) => canBrand(me, brandId, action));
}

export function usePermissions() {
  const me = useCurrentUser();
  return useMemo(
    () => ({
      canConsole: (action: ConsoleAction) => canConsole(me, action),
      canBrand: (brandId: string | undefined, action: BrandAction) =>
        !!brandId && canBrand(me, brandId, action),
      hasAccess: (access: RouteAccess, brandId?: string) => hasAccess(me, access, brandId),
    }),
    [me],
  );
}

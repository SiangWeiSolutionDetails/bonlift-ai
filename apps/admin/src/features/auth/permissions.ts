import { useMemo } from "react";
import {
  isBrandAction,
  isConsoleAction,
  type AuthMeResponseSchemaType,
  type BrandAction,
  type ConsoleAction,
} from "@bonlift-ai/contracts";
// Relative, not "@/": the root vitest config has no alias, and this file is unit-tested.
import { useCurrentUser } from "./queries";

type Me = AuthMeResponseSchemaType;
export type MeBrand = Me["brands"][number];

// A brand page passes with any one of its actions on the workspace brand
export type RouteAccess = { console: ConsoleAction } | { brand: BrandAction | BrandAction[] };

function consoleActions(me: Me): ConsoleAction[] {
  return (me.console?.actions ?? []).filter(isConsoleAction);
}

function brandActions(brand: MeBrand): BrandAction[] {
  return brand.actions.filter(isBrandAction);
}

export function canConsole(me: Me, action: ConsoleAction) {
  return consoleActions(me).includes(action);
}

// Admin grants nothing inside a brand; only a role held on that brand does
export function canBrand(me: Me, brandId: string, action: BrandAction) {
  const brand = me.brands.find((b) => b.brandId === brandId);
  return !!brand && brandActions(brand).includes(action);
}

export function hasAccess(me: Me, access: RouteAccess, brandId?: string) {
  if ("console" in access) return canConsole(me, access.console);
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

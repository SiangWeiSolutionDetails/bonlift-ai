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

export type RouteAccess =
  | { console: ConsoleAction; orAnyBrandRole?: boolean }
  | { anyBrand: BrandAction };

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

export function brandsWith(me: Me, action: BrandAction): MeBrand[] {
  return me.brands.filter((brand) => brandActions(brand).includes(action));
}

export function hasAccess(me: Me, access: RouteAccess) {
  if ("anyBrand" in access) return brandsWith(me, access.anyBrand).length > 0;
  return canConsole(me, access.console) || (!!access.orAnyBrandRole && me.brands.length > 0);
}

export function usePermissions() {
  const me = useCurrentUser();
  return useMemo(
    () => ({
      canConsole: (action: ConsoleAction) => canConsole(me, action),
      canBrand: (brandId: string | undefined, action: BrandAction) =>
        !!brandId && canBrand(me, brandId, action),
      brandsWith: (action: BrandAction) => brandsWith(me, action),
      hasAccess: (access: RouteAccess) => hasAccess(me, access),
    }),
    [me],
  );
}

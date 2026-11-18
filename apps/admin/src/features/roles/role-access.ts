import {
  BRAND_ACTIONS,
  isConsoleAction,
  PERSONAL_DATA_ACTIONS,
  type AuthMeResponseSchemaType,
  type BrandAction,
} from "@bonlift-ai/contracts";
import { brandRoleActions, canBrand, providerActions } from "../auth/permissions";
import type { RoleScope } from "./type";

type Me = AuthMeResponseSchemaType;

const NON_PERSONAL_BRAND_ACTIONS = BRAND_ACTIONS.filter(
  (action) => !PERSONAL_DATA_ACTIONS.includes(action),
);

const consoleActionsOf = (me: Me) => me.console?.actions ?? [];

// Through a brand role on the brand, or through provider access on every brand
export function holdsBrandAction(me: Me, brandId: string, action: BrandAction) {
  return canBrand(me, brandId, action);
}

// Mirrors the API's grant limit: provider support may grant all but personal data, and a brand role adds its own actions
function brandGrantLimit(me: Me, brandId: string): Set<string> {
  const viaProvider = providerActions(me).includes("brandRoles.manage")
    ? NON_PERSONAL_BRAND_ACTIONS
    : [];
  return new Set([...viaProvider, ...brandRoleActions(me, brandId)]);
}

export function grantLimit(me: Me, scope: RoleScope): ReadonlySet<string> {
  if (scope.kind === "brand") return brandGrantLimit(me, scope.brandId);
  return new Set(consoleActionsOf(me).filter(isConsoleAction));
}

export function isWithinLimit(actions: readonly string[], limit: ReadonlySet<string>) {
  return actions.every((action) => limit.has(action));
}

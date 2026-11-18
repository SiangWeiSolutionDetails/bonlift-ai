import {
  BRAND_ACTIONS,
  isBrandAction,
  isConsoleAction,
  PERSONAL_DATA_ACTIONS,
  providerBrandActions,
  type AuthMeResponseSchemaType,
  type BrandAction,
} from "@bonlift-ai/contracts";
import type { RoleScope } from "./type";

type Me = AuthMeResponseSchemaType;

const NON_PERSONAL_BRAND_ACTIONS = BRAND_ACTIONS.filter(
  (action) => !PERSONAL_DATA_ACTIONS.includes(action),
);

const consoleActionsOf = (me: Me) => me.console?.actions ?? [];

function brandRoleActions(me: Me, brandId: string): BrandAction[] {
  return me.brands.find((brand) => brand.brandId === brandId)?.actions.filter(isBrandAction) ?? [];
}

function providerActions(me: Me): BrandAction[] {
  return providerBrandActions(consoleActionsOf(me)).filter(
    (action) => !PERSONAL_DATA_ACTIONS.includes(action),
  );
}

// Through a brand role on the brand, or through provider access on every brand
export function holdsBrandAction(me: Me, brandId: string, action: BrandAction) {
  return [...brandRoleActions(me, brandId), ...providerActions(me)].includes(action);
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

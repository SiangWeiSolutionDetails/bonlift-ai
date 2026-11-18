import {
  CONSOLE_ACTIONS,
  isBrandAction,
  isConsoleAction,
  PERSONAL_DATA_ACTIONS,
  providerBrandActions,
  type BrandAction,
  type ConsoleAction,
} from "@bonlift-ai/contracts";
import {
  hashSessionToken,
  SESSION_CTES,
  sessionParams,
  type Queryable,
  type SessionUser,
} from "./session.service.js";

export type BrandRef = "params.brandId" | "params.outletId" | "params.runId" | "body.brandId";
export type BrandCheck = { brand: BrandAction; from: BrandRef } | { brandMember: BrandRef };
type ConsoleCheck = { console: ConsoleAction };
export type AccessCheck = ConsoleCheck | BrandCheck;
export type RouteAccess = "signedIn" | AccessCheck | { anyOf: AccessCheck[] };
export type RequestAccess = { user: SessionUser; isAdmin: boolean; consoleActions: ConsoleAction[] };
export type Decision = "allow" | "forbidden" | "notFound";

export interface AuthorizationRow {
  id: string;
  email: string;
  display_name: string | null;
  console_is_builtin: boolean | null;
  console_actions: string[] | null;
  brand_exists: boolean;
  has_brand_role: boolean;
  brand_actions: string[] | null;
}

export interface Authorization {
  access: RequestAccess;
  brandActions: BrandAction[] | null;
  decision: Decision;
}

const LIVE_TENANT_JOIN = `
      JOIN tenants tn
        ON tn.id = b.tenant_id
       AND tn.deleted_at IS NULL`;

const BRAND_ID_TARGET = `
      SELECT b.id
      FROM brands b${LIVE_TENANT_JOIN}
      WHERE b.id = $4::uuid
        AND b.deleted_at IS NULL`;

const TARGETS: Record<BrandRef, string> = {
  "params.brandId": BRAND_ID_TARGET,
  "body.brandId": BRAND_ID_TARGET,
  "params.outletId": `
      SELECT o.brand_id AS id
      FROM outlets o
      JOIN brands b
        ON b.id = o.brand_id${LIVE_TENANT_JOIN}
      WHERE o.id = $4::uuid
        AND o.deleted_at IS NULL
        AND b.deleted_at IS NULL`,
  "params.runId": `
      SELECT r.brand_id AS id
      FROM computation_runs r
      JOIN brands b
        ON b.id = r.brand_id${LIVE_TENANT_JOIN}
      WHERE r.id = $4::uuid
        AND b.deleted_at IS NULL`,
};

// array_remove drops the NULL that the LEFT JOIN yields for a role with no permission rows.
const CONSOLE_ROLE_CTE = `
    console_role AS (
      SELECT r.is_builtin, array_remove(array_agg(rp.action), NULL) AS actions
      FROM s
      JOIN user_console_roles ucr
        ON ucr.user_id = s.id
      JOIN roles r
        ON r.id = ucr.role_id
      LEFT JOIN role_permissions rp
        ON rp.role_id = r.id
      GROUP BY r.id, r.is_builtin
    )`;

const BRAND_ROLE_CTE = `
    brand_role AS (
      SELECT array_remove(array_agg(rp.action), NULL) AS actions
      FROM s
      JOIN user_brand_roles ubr
        ON ubr.user_id = s.id
      JOIN target t
        ON t.id = ubr.brand_id
      LEFT JOIN role_permissions rp
        ON rp.role_id = ubr.role_id
      GROUP BY ubr.role_id
    )`;

function buildSql(ref: BrandRef | null): string {
  if (!ref) {
    return `
    WITH ${SESSION_CTES},
    ${CONSOLE_ROLE_CTE}
    SELECT s.id, s.email, s.display_name,
           cr.is_builtin AS console_is_builtin, cr.actions AS console_actions,
           false AS brand_exists, false AS has_brand_role, NULL::text[] AS brand_actions
    FROM s
    LEFT JOIN console_role cr ON true
    `;
  }
  return `
    WITH ${SESSION_CTES},
    ${CONSOLE_ROLE_CTE},
    target AS (${TARGETS[ref]}
    ),
    ${BRAND_ROLE_CTE}
    SELECT s.id, s.email, s.display_name,
           cr.is_builtin AS console_is_builtin, cr.actions AS console_actions,
           EXISTS (SELECT 1 FROM target) AS brand_exists,
           br.actions IS NOT NULL AS has_brand_role, br.actions AS brand_actions
    FROM s
    LEFT JOIN console_role cr ON true
    LEFT JOIN brand_role br ON true
    `;
}

export function checksOf(access: RouteAccess): AccessCheck[] {
  if (access === "signedIn") return [];
  return "anyOf" in access ? access.anyOf : [access];
}

function brandRefOf(check: AccessCheck): BrandRef | null {
  if ("from" in check) return check.from;
  if ("brandMember" in check) return check.brandMember;
  return null;
}

export function resolveBrandRef(access: RouteAccess): BrandRef | null {
  const refs = new Set(checksOf(access).map(brandRefOf).filter((ref) => ref !== null));
  if (refs.size > 1) {
    throw new Error(`Route access declares more than one brand ref: ${[...refs].join(", ")}`);
  }
  return refs.values().next().value ?? null;
}

function consoleActionsOf(row: AuthorizationRow): ConsoleAction[] {
  if (row.console_is_builtin) return [...CONSOLE_ACTIONS];
  return (row.console_actions ?? []).filter(isConsoleAction);
}

function brandActionsOf(row: AuthorizationRow): BrandAction[] | null {
  return row.has_brand_role ? (row.brand_actions ?? []).filter(isBrandAction) : null;
}

// Provider access needs a live brand on a live tenant, and never carries personal data.
function providerActionsOf(row: AuthorizationRow, consoleActions: ConsoleAction[]): BrandAction[] | null {
  if (!row.brand_exists) return null;
  const actions = providerBrandActions(consoleActions).filter((action) => !PERSONAL_DATA_ACTIONS.includes(action));
  return actions.length > 0 ? actions : null;
}

type BrandAccess = { roleActions: BrandAction[] | null; providerActions: BrandAction[] | null };

const hasBrandAccess = (brand: BrandAccess) => brand.roleActions !== null || brand.providerActions !== null;

const brandAllows = (brand: BrandAccess, action: BrandAction) =>
  (brand.roleActions?.includes(action) ?? false) || (brand.providerActions?.includes(action) ?? false);

function decideCheck(check: AccessCheck, consoleActions: ConsoleAction[], brand: BrandAccess): Decision {
  if ("console" in check) return consoleActions.includes(check.console) ? "allow" : "forbidden";
  if (!hasBrandAccess(brand)) return "notFound";
  if ("brandMember" in check) return "allow";
  return brandAllows(brand, check.brand) ? "allow" : "forbidden";
}

export function decide(row: AuthorizationRow, access: RouteAccess): Decision {
  if (access === "signedIn") return "allow";

  const consoleActions = consoleActionsOf(row);
  const brand = { roleActions: brandActionsOf(row), providerActions: providerActionsOf(row, consoleActions) };
  if (!("anyOf" in access)) return decideCheck(access, consoleActions, brand);

  if (access.anyOf.some((check) => decideCheck(check, consoleActions, brand) === "allow")) return "allow";
  if (!resolveBrandRef(access) || hasBrandAccess(brand)) return "forbidden";
  return "notFound";
}

export async function authorizeRequest(
  db: Queryable,
  token: string,
  access: RouteAccess,
  refs: Partial<Record<BrandRef, string>>,
): Promise<Authorization | null> {
  const ref = resolveBrandRef(access);
  const idHash = hashSessionToken(token);
  if (!idHash) return null;

  const params: unknown[] = sessionParams(idHash);
  if (ref) params.push(refs[ref] ?? null);

  const result = await db.query<AuthorizationRow>(buildSql(ref), params);
  const row = result.rows[0];
  if (!row) return null;

  return {
    access: {
      user: { id: row.id, email: row.email, displayName: row.display_name },
      isAdmin: row.console_is_builtin === true,
      consoleActions: consoleActionsOf(row),
    },
    brandActions: brandActionsOf(row),
    decision: decide(row, access),
  };
}

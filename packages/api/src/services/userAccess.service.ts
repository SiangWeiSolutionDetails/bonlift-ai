import {
  CONSOLE_ACTIONS,
  isBrandAction,
  isConsoleAction,
  type AuthMeResponseSchemaType,
} from "@bonlift-ai/contracts";
import { hashSessionToken, SESSION_CTES, sessionParams, type Queryable } from "./session.service.js";

export interface ConsoleAccessJson {
  roleId: string;
  roleName: string;
  isBuiltin: boolean;
  actions: string[];
}

export interface BrandAccessJson {
  brandId: string;
  brandName: string;
  tenantId: string;
  tenantName: string;
  roleId: string;
  roleName: string;
  actions: string[];
}

export interface UserAccessRow {
  id: string;
  email: string;
  display_name: string | null;
  console: ConsoleAccessJson | null;
  brands: BrandAccessJson[];
}

// One row: the session user, their console role (or null) and their live brands ordered by tenant then brand name.
// Subselects over s return no console row / an empty array when the user has no roles.
const SQL = `
    WITH ${SESSION_CTES}
    SELECT s.id, s.email, s.display_name,
           (
             SELECT json_build_object(
                      'roleId', r.id,
                      'roleName', r.name,
                      'isBuiltin', r.is_builtin,
                      'actions', COALESCE(
                        (SELECT array_agg(rp.action) FROM role_permissions rp WHERE rp.role_id = r.id),
                        '{}'
                      )
                    )
             FROM user_console_roles ucr
             JOIN roles r
               ON r.id = ucr.role_id
             WHERE ucr.user_id = s.id
           ) AS console,
           (
             SELECT COALESCE(
                      json_agg(
                        json_build_object(
                          'brandId', b.id,
                          'brandName', b.name,
                          'tenantId', t.id,
                          'tenantName', t.name,
                          'roleId', r.id,
                          'roleName', r.name,
                          'actions', COALESCE(
                            (SELECT array_agg(rp.action) FROM role_permissions rp WHERE rp.role_id = r.id),
                            '{}'
                          )
                        )
                        ORDER BY t.name, b.name, b.id
                      ),
                      '[]'::json
                    )
             FROM user_brand_roles ubr
             JOIN brands b
               ON b.id = ubr.brand_id
              AND b.deleted_at IS NULL
             JOIN tenants t
               ON t.id = b.tenant_id
              AND t.deleted_at IS NULL
             JOIN roles r
               ON r.id = ubr.role_id
             WHERE ubr.user_id = s.id
           ) AS brands
    FROM s
    `;

export function mapUserAccess(row: UserAccessRow): AuthMeResponseSchemaType {
  const { console: consoleRole } = row;
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    console: consoleRole
      ? {
          roleId: consoleRole.roleId,
          roleName: consoleRole.roleName,
          isAdmin: consoleRole.isBuiltin,
          actions: consoleRole.isBuiltin ? [...CONSOLE_ACTIONS] : consoleRole.actions.filter(isConsoleAction),
        }
      : null,
    brands: row.brands.map(({ actions, ...brand }) => ({ ...brand, actions: actions.filter(isBrandAction) })),
  };
}

export async function findSessionUserAccess(
  db: Queryable,
  token: string,
): Promise<AuthMeResponseSchemaType | null> {
  const idHash = hashSessionToken(token);
  if (!idHash) return null;

  const result = await db.query<UserAccessRow>(SQL, sessionParams(idHash));
  const row = result.rows[0];
  return row ? mapUserAccess(row) : null;
}

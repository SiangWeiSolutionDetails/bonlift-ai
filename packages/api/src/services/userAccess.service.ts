import {
  CONSOLE_ACTIONS,
  isBrandAction,
  isConsoleAction,
  UpdateOwnNameBodySchema,
  type AuthMeResponseSchemaType,
  type DisplayNameSource,
  type UpdateOwnNameBodySchemaType,
} from "@bonlift-ai/contracts";
import { ForbiddenError, UnauthorizedError, ValidationError } from "../errors.js";
import { assertValid } from "../utils/validate.js";
import { hashSessionToken, SESSION_CTES, sessionParams, type Queryable } from "./session.service.js";

const OWN_NAME_MAX_LENGTH = 200;

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
  display_name_source: DisplayNameSource | null;
  console: ConsoleAccessJson | null;
  brands: BrandAccessJson[];
}

// The user in `alias`, their console role (or null) and their live brands ordered by tenant then brand name.
// The subselects return no console row / an empty array when the user has no roles.
const accessColumns = (alias: string) => `
           ${alias}.id, ${alias}.email, ${alias}.display_name, ${alias}.display_name_source,
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
             WHERE ucr.user_id = ${alias}.id
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
             WHERE ubr.user_id = ${alias}.id
           ) AS brands`;

const SQL = `
    WITH ${SESSION_CTES}
    SELECT ${accessColumns("s")}
    FROM s
    `;

// $4 is the trimmed name. The update re-checks the source on the locked row, so a session that is live but renamed
// nothing means staff hold the name, possibly set after the snapshot.
const UPDATE_OWN_NAME_SQL = `
    WITH ${SESSION_CTES},
    renamed AS (
      UPDATE users u
      SET display_name = $4, display_name_source = 'self', updated_at = now()
      FROM s
      WHERE u.id = s.id
        AND u.display_name_source IS DISTINCT FROM 'staff'
      RETURNING u.id, u.email, u.display_name, u.display_name_source
    )
    SELECT
      s.id IS NOT NULL AS session_valid,
      (s.id IS NOT NULL AND renamed.id IS NULL) AS name_locked,
      ${accessColumns("renamed")}
    FROM (VALUES (1)) AS one (x)
    LEFT JOIN s ON true
    LEFT JOIN renamed ON true
    `;

export function mapUserAccess(row: UserAccessRow): AuthMeResponseSchemaType {
  const { console: consoleRole } = row;
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    nameLocked: row.display_name_source === "staff",
    needsNameConfirmation: row.display_name_source === null || row.display_name_source === "provider",
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

function trimmedOwnName(body: UpdateOwnNameBodySchemaType): string {
  assertValid(UpdateOwnNameBodySchema, body);
  const name = body.displayName.trim();
  if (name.length === 0 || name.length > OWN_NAME_MAX_LENGTH) {
    throw new ValidationError(`displayName must be 1 to ${OWN_NAME_MAX_LENGTH} characters.`);
  }
  return name;
}

export async function updateOwnName(
  db: Queryable,
  token: string,
  body: UpdateOwnNameBodySchemaType,
): Promise<AuthMeResponseSchemaType> {
  const displayName = trimmedOwnName(body);
  const idHash = hashSessionToken(token);
  if (!idHash) throw new UnauthorizedError("Not signed in");

  const result = await db.query(UPDATE_OWN_NAME_SQL, [...sessionParams(idHash), displayName]);
  const row = result.rows[0];
  if (!row.session_valid) throw new UnauthorizedError("Not signed in");
  if (row.name_locked) throw new ForbiddenError("Your name was set by staff and cannot be changed.");
  return mapUserAccess(row);
}

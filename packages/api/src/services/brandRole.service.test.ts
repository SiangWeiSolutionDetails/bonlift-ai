import { BRAND_ACTIONS, CONSOLE_ACTIONS, PERSONAL_DATA_ACTIONS, type BrandAction } from "@bonlift-ai/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../errors.js";
import { pgResult } from "../utils/pg.test-helpers.js";
import { FOREIGN_KEY_VIOLATION, UNIQUE_VIOLATION } from "../utils/pgErrors.js";
import type { RequestAccess } from "./authorization.service.js";
import {
  brandRoleGrantLimit,
  createBrandRole,
  deleteBrandRole,
  listBrandRoleAssignments,
  listBrandRoles,
  updateBrandRole,
} from "./brandRole.service.js";

const BRAND_ID = "33333333-3333-3333-3333-333333333333";
const ROLE_ID = "11111111-1111-1111-1111-111111111111";
const USER_ID = "22222222-2222-2222-2222-222222222222";

const queryMock = vi.fn();
const fakePool = { query: queryMock } as any;

function actorWith(consoleActions: RequestAccess["consoleActions"], isAdmin = false): RequestAccess {
  return { user: { id: USER_ID, email: "lead@x.com", displayName: null }, isAdmin, consoleActions };
}

const merchant = actorWith([]);
const support = actorWith(["provider.support"]);
const admin = actorWith([...CONSOLE_ACTIONS], true);
const MANAGER_ACTIONS: BrandAction[] = ["brandRoles.view", "brandRoles.manage", "outlets.view", "results.view"];
const NON_PERSONAL = BRAND_ACTIONS.filter((action) => !PERSONAL_DATA_ACTIONS.includes(action));

function updateRow(overrides: Record<string, unknown> = {}) {
  return {
    brand_found: true,
    found: true,
    builtin: false,
    actor_holds: false,
    current_subset: true,
    id: ROLE_ID,
    name: "Viewer",
    kind: "brand",
    is_builtin: false,
    current_actions: ["outlets.view"],
    assignment_count: "2",
    ...overrides,
  };
}

function deleteRow(overrides: Record<string, unknown> = {}) {
  return { brand_found: true, found: true, builtin: false, actor_holds: false, current_subset: true, ...overrides };
}

beforeEach(() => {
  queryMock.mockReset();
});

describe("brandRoleGrantLimit", () => {
  it("is the actor's brand-role actions for a merchant manager", () => {
    expect(brandRoleGrantLimit(merchant, MANAGER_ACTIONS)).toEqual(MANAGER_ACTIONS);
  });

  it("is every brand action except personal data for provider support", () => {
    expect(new Set(brandRoleGrantLimit(support, null))).toEqual(new Set(NON_PERSONAL));
  });

  it("gives Admin the provider support limit", () => {
    expect(new Set(brandRoleGrantLimit(admin, null))).toEqual(new Set(NON_PERSONAL));
  });

  it("adds personal-data actions only when held through a brand role", () => {
    const limit = brandRoleGrantLimit(support, ["customerScores.view"]);

    expect(new Set(limit)).toEqual(new Set([...NON_PERSONAL, "customerScores.view"]));
    expect(limit).not.toContain("snapshots.viewCustomerIds");
  });

  it("gives provider view nothing beyond the brand role", () => {
    expect(brandRoleGrantLimit(actorWith(["provider.view"]), ["outlets.view"])).toEqual(["outlets.view"]);
    expect(brandRoleGrantLimit(actorWith(["provider.view"]), null)).toEqual([]);
  });
});

describe("listBrandRoles", () => {
  it("lists the brand's tenant roles with their counts", async () => {
    queryMock.mockResolvedValueOnce(
      pgResult([
        { id: ROLE_ID, name: "Brand Owner", kind: "brand", is_builtin: true, actions: ["results.view", "outlets.view", "gone.action"], assignment_count: "3" },
      ]),
    );

    const roles = await listBrandRoles(fakePool, BRAND_ID);

    expect(roles).toEqual([
      { id: ROLE_ID, name: "Brand Owner", kind: "brand", isBuiltin: true, actions: ["outlets.view", "results.view"], assignmentCount: 3 },
    ]);
    expect(queryMock.mock.calls[0][1]).toEqual([BRAND_ID]);
  });

  it("drops the empty row of a brand with no roles", async () => {
    queryMock.mockResolvedValueOnce(pgResult([{ id: null }]));

    expect(await listBrandRoles(fakePool, BRAND_ID)).toEqual([]);
  });

  it("returns 404 for a missing brand", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    await expect(listBrandRoles(fakePool, BRAND_ID)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("createBrandRole", () => {
  it("creates the role in the brand's tenant in one statement", async () => {
    queryMock.mockResolvedValueOnce(
      pgResult([{ brand_found: true, id: ROLE_ID, name: "Reader", kind: "brand", is_builtin: false }]),
    );

    const role = await createBrandRole(fakePool, merchant, MANAGER_ACTIONS, BRAND_ID, {
      name: "Reader",
      actions: ["results.view", "outlets.view"],
    });

    expect(role).toEqual({
      id: ROLE_ID,
      name: "Reader",
      kind: "brand",
      isBuiltin: false,
      actions: ["outlets.view", "results.view"],
      assignmentCount: 0,
    });
    expect(queryMock.mock.calls[0][1]).toEqual([BRAND_ID, "Reader", ["results.view", "outlets.view"]]);
  });

  it("rejects console and unknown actions", async () => {
    await expect(
      createBrandRole(fakePool, admin, null, BRAND_ID, { name: "Mixed", actions: ["outlets.view", "tenants.view"] }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      createBrandRole(fakePool, admin, null, BRAND_ID, { name: "Typo", actions: ["outlets.veiw"] }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("refuses actions beyond a merchant manager's brand role", async () => {
    await expect(
      createBrandRole(fakePool, merchant, MANAGER_ACTIONS, BRAND_ID, { name: "Lead", actions: ["members.manage"] }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("refuses a personal-data action for provider support without a brand role holding it", async () => {
    await expect(
      createBrandRole(fakePool, support, null, BRAND_ID, { name: "Analyst", actions: ["customerScores.view"] }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("lets provider support grant members.manage and other non-personal actions", async () => {
    queryMock.mockResolvedValueOnce(
      pgResult([{ brand_found: true, id: ROLE_ID, name: "Lead", kind: "brand", is_builtin: false }]),
    );

    const role = await createBrandRole(fakePool, support, null, BRAND_ID, {
      name: "Lead",
      actions: ["members.manage", "apiKeys.create"],
    });

    expect(role.actions).toEqual(["apiKeys.create", "members.manage"]);
  });

  it("returns 404 when the brand is gone", async () => {
    queryMock.mockResolvedValueOnce(pgResult([{ brand_found: false, id: null }]));

    await expect(
      createBrandRole(fakePool, support, null, BRAND_ID, { name: "Reader", actions: [] }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("returns 409 for a duplicate name in the tenant", async () => {
    queryMock.mockRejectedValueOnce({ code: UNIQUE_VIOLATION, constraint: "roles_brand_tenant_name_key" });

    await expect(
      createBrandRole(fakePool, support, null, BRAND_ID, { name: "Reader", actions: [] }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("updateBrandRole", () => {
  it("replaces the actions and renames in one statement, bounded by the grant limit", async () => {
    queryMock.mockResolvedValueOnce(pgResult([updateRow({ name: "Reader" })]));

    const role = await updateBrandRole(fakePool, merchant, MANAGER_ACTIONS, BRAND_ID, ROLE_ID, {
      name: "Reader",
      actions: ["results.view", "outlets.view"],
    });

    expect(role).toEqual({
      id: ROLE_ID,
      name: "Reader",
      kind: "brand",
      isBuiltin: false,
      actions: ["outlets.view", "results.view"],
      assignmentCount: 2,
    });
    expect(queryMock.mock.calls[0][1]).toEqual([
      BRAND_ID,
      ROLE_ID,
      USER_ID,
      "Reader",
      MANAGER_ACTIONS,
      ["results.view", "outlets.view"],
    ]);
  });

  it("keeps the current actions on a rename only", async () => {
    queryMock.mockResolvedValueOnce(pgResult([updateRow({ name: "Reader" })]));

    const role = await updateBrandRole(fakePool, merchant, MANAGER_ACTIONS, BRAND_ID, ROLE_ID, { name: "Reader" });

    expect(role.actions).toEqual(["outlets.view"]);
    expect(queryMock.mock.calls[0][1]).toEqual([BRAND_ID, ROLE_ID, USER_ID, "Reader", MANAGER_ACTIONS]);
  });

  it("refuses new actions beyond the grant limit before querying", async () => {
    await expect(
      updateBrandRole(fakePool, merchant, MANAGER_ACTIONS, BRAND_ID, ROLE_ID, { actions: ["members.manage"] }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      updateBrandRole(fakePool, support, null, BRAND_ID, ROLE_ID, { actions: ["snapshots.viewCustomerIds"] }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("rejects console actions", async () => {
    await expect(
      updateBrandRole(fakePool, admin, null, BRAND_ID, ROLE_ID, { actions: ["roles.manage"] }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it.each([
    ["a missing brand", { brand_found: false, found: false }, NotFoundError],
    ["a role of another tenant or unknown", { found: false }, NotFoundError],
    ["the built-in Brand Owner", { builtin: true }, ForbiddenError],
    ["a role the actor holds", { actor_holds: true }, ForbiddenError],
    ["a role holding actions beyond the grant limit", { current_subset: false }, ForbiddenError],
  ])("refuses %s", async (_, flags, error) => {
    queryMock.mockResolvedValueOnce(pgResult([updateRow({ ...flags, id: null })]));

    await expect(
      updateBrandRole(fakePool, merchant, MANAGER_ACTIONS, BRAND_ID, ROLE_ID, { name: "Reader" }),
    ).rejects.toBeInstanceOf(error);
  });

  it("returns 409 for a duplicate name in the tenant", async () => {
    queryMock.mockRejectedValueOnce({ code: UNIQUE_VIOLATION, constraint: "roles_brand_tenant_name_key" });

    await expect(
      updateBrandRole(fakePool, support, null, BRAND_ID, ROLE_ID, { name: "Viewer" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("deleteBrandRole", () => {
  it("deletes in one guarded statement", async () => {
    queryMock.mockResolvedValueOnce(pgResult([deleteRow()]));

    await deleteBrandRole(fakePool, merchant, MANAGER_ACTIONS, BRAND_ID, ROLE_ID);

    expect(queryMock.mock.calls[0][1]).toEqual([BRAND_ID, ROLE_ID, USER_ID, MANAGER_ACTIONS]);
  });

  it.each([
    ["a missing brand", { brand_found: false, found: false }, NotFoundError],
    ["a role of another tenant or unknown", { found: false }, NotFoundError],
    ["the built-in Brand Owner", { builtin: true }, ForbiddenError],
    ["a role the actor holds", { actor_holds: true }, ForbiddenError],
    ["a role holding actions beyond the grant limit", { current_subset: false }, ForbiddenError],
  ])("refuses %s", async (_, flags, error) => {
    queryMock.mockResolvedValueOnce(pgResult([deleteRow(flags)]));

    await expect(deleteBrandRole(fakePool, merchant, MANAGER_ACTIONS, BRAND_ID, ROLE_ID)).rejects.toBeInstanceOf(
      error,
    );
  });

  it("returns 409 when the role is in use", async () => {
    queryMock.mockRejectedValueOnce({ code: FOREIGN_KEY_VIOLATION, constraint: "user_brand_roles_role_fkey" });

    await expect(deleteBrandRole(fakePool, support, null, BRAND_ID, ROLE_ID)).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("listBrandRoleAssignments", () => {
  const holderRow = {
    found: true,
    user_id: USER_ID,
    email: "a@x.com",
    display_name: null,
    status: "active",
    brand_id: BRAND_ID,
    brand_name: "Alpha",
    tenant_name: "Group",
  };

  it("needs members.view on the brand besides brandRoles.view", async () => {
    await expect(
      listBrandRoleAssignments(fakePool, merchant, ["brandRoles.view"], BRAND_ID, ROLE_ID),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("lists the holders for a merchant with both actions", async () => {
    queryMock.mockResolvedValueOnce(pgResult([holderRow]));

    const rows = await listBrandRoleAssignments(fakePool, merchant, ["brandRoles.view", "members.view"], BRAND_ID, ROLE_ID);

    expect(rows).toEqual([
      { userId: USER_ID, email: "a@x.com", displayName: null, status: "active", brandId: BRAND_ID, brandName: "Alpha", tenantName: "Group" },
    ]);
    expect(queryMock.mock.calls[0][1]).toEqual([BRAND_ID, ROLE_ID]);
  });

  it("lets provider view list the holders without a brand role", async () => {
    queryMock.mockResolvedValueOnce(pgResult([{ found: true, user_id: null }]));

    expect(await listBrandRoleAssignments(fakePool, actorWith(["provider.view"]), null, BRAND_ID, ROLE_ID)).toEqual([]);
  });

  it("returns 404 for a role outside the brand's tenant", async () => {
    queryMock.mockResolvedValueOnce(pgResult([{ found: false, user_id: null }]));

    await expect(listBrandRoleAssignments(fakePool, support, null, BRAND_ID, ROLE_ID)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

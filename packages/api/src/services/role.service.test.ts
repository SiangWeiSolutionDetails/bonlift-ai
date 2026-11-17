import { CONSOLE_ACTIONS } from "@bonlift-ai/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../errors.js";
import { pgResult } from "../utils/pg.test-helpers.js";
import { FOREIGN_KEY_VIOLATION, UNIQUE_VIOLATION } from "../utils/pgErrors.js";
import type { RequestAccess } from "./authorization.service.js";
import { createRole, deleteRole, listRoleAssignments, listRoles, updateRole } from "./role.service.js";

const ROLE_ID = "11111111-1111-1111-1111-111111111111";
const USER_ID = "22222222-2222-2222-2222-222222222222";

const queryMock = vi.fn();
const fakePool = { query: queryMock } as any;

function actorWith(consoleActions: RequestAccess["consoleActions"], isAdmin = false): RequestAccess {
  return { user: { id: USER_ID, email: "lead@x.com", displayName: null }, isAdmin, consoleActions };
}

const admin = actorWith([...CONSOLE_ACTIONS], true);
const roleManager = actorWith(["roles.view", "roles.manage", "users.view"]);

function flagsRow(overrides: Record<string, unknown> = {}) {
  return {
    found: true,
    builtin: false,
    kind_matches: true,
    actor_holds: false,
    id: ROLE_ID,
    name: "Viewer",
    kind: "brand",
    is_builtin: false,
    current_actions: ["outlets.view"],
    assignment_count: "2",
    ...overrides,
  };
}

beforeEach(() => {
  queryMock.mockReset();
});

describe("listRoles", () => {
  it("drops stale keys, gives Admin every console action and counts assignments", async () => {
    queryMock.mockResolvedValueOnce(
      pgResult([
        { id: ROLE_ID, name: "Viewer", kind: "brand", is_builtin: false, actions: ["outlets.view", "gone.action"], assignment_count: "3" },
        { id: USER_ID, name: "Admin", kind: "console", is_builtin: true, actions: [], assignment_count: "1" },
      ]),
    );

    const roles = await listRoles(fakePool);

    expect(roles).toEqual([
      { id: ROLE_ID, name: "Viewer", kind: "brand", isBuiltin: false, actions: ["outlets.view"], assignmentCount: 3 },
      { id: USER_ID, name: "Admin", kind: "console", isBuiltin: true, actions: [...CONSOLE_ACTIONS], assignmentCount: 1 },
    ]);
    expect(queryMock.mock.calls[0][1]).toEqual([null]);
  });

  it("filters by kind", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    await listRoles(fakePool, "console");

    expect(queryMock.mock.calls[0][1]).toEqual(["console"]);
  });
});

describe("createRole", () => {
  it("creates a role with its actions in one statement", async () => {
    queryMock.mockResolvedValueOnce(pgResult([{ id: ROLE_ID, name: "Viewer", kind: "brand", is_builtin: false }]));

    const role = await createRole(fakePool, roleManager, {
      name: "Viewer",
      kind: "brand",
      actions: ["results.view", "outlets.view"],
    });

    expect(role).toEqual({
      id: ROLE_ID,
      name: "Viewer",
      kind: "brand",
      isBuiltin: false,
      actions: ["outlets.view", "results.view"],
      assignmentCount: 0,
    });
    expect(queryMock.mock.calls[0][1]).toEqual(["Viewer", "brand", ["results.view", "outlets.view"]]);
  });

  it("rejects actions of the other kind", async () => {
    await expect(
      createRole(fakePool, admin, { name: "Mixed", kind: "brand", actions: ["outlets.view", "tenants.view"] }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("rejects unknown action keys", async () => {
    await expect(
      createRole(fakePool, admin, { name: "Typo", kind: "console", actions: ["tenants.veiw"] }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("refuses console actions the actor lacks", async () => {
    await expect(
      createRole(fakePool, roleManager, { name: "Grantor", kind: "console", actions: ["users.assignConsoleRoles"] }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("lets an Admin create a console role with any console action", async () => {
    queryMock.mockResolvedValueOnce(pgResult([{ id: ROLE_ID, name: "Grantor", kind: "console", is_builtin: false }]));

    const role = await createRole(fakePool, admin, {
      name: "Grantor",
      kind: "console",
      actions: ["users.assignConsoleRoles"],
    });

    expect(role.actions).toEqual(["users.assignConsoleRoles"]);
  });

  it("returns 409 for a duplicate name", async () => {
    queryMock.mockRejectedValueOnce({ code: UNIQUE_VIOLATION, constraint: "roles_kind_name_key" });

    await expect(
      createRole(fakePool, admin, { name: "Viewer", kind: "brand", actions: [] }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("updateRole", () => {
  it("replaces the actions and renames in one statement", async () => {
    queryMock.mockResolvedValueOnce(pgResult([flagsRow({ name: "Reader" })]));

    const role = await updateRole(fakePool, roleManager, ROLE_ID, {
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
      ROLE_ID,
      USER_ID,
      "Reader",
      false,
      roleManager.consoleActions,
      "brand",
      ["results.view", "outlets.view"],
    ]);
  });

  it("keeps the current actions on a rename only", async () => {
    queryMock.mockResolvedValueOnce(pgResult([flagsRow({ name: "Reader" })]));

    const role = await updateRole(fakePool, roleManager, ROLE_ID, { name: "Reader" });

    expect(role.actions).toEqual(["outlets.view"]);
    expect(queryMock.mock.calls[0][1]).toEqual([ROLE_ID, USER_ID, "Reader", false, roleManager.consoleActions]);
  });

  it("rejects actions of mixed kinds", async () => {
    await expect(
      updateRole(fakePool, admin, ROLE_ID, { actions: ["outlets.view", "tenants.view"] }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("rejects unknown action keys", async () => {
    await expect(updateRole(fakePool, admin, ROLE_ID, { actions: ["gone.action"] })).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("refuses console actions the actor lacks", async () => {
    await expect(
      updateRole(fakePool, roleManager, ROLE_ID, { actions: ["roles.view", "users.assignConsoleRoles"] }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown role", async () => {
    queryMock.mockResolvedValueOnce(pgResult([flagsRow({ found: false, id: null })]));

    await expect(updateRole(fakePool, admin, ROLE_ID, { name: "Reader" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("refuses to edit or delete a built-in role", async () => {
    queryMock.mockResolvedValueOnce(pgResult([flagsRow({ builtin: true, id: null })]));
    await expect(updateRole(fakePool, admin, ROLE_ID, { name: "Boss" })).rejects.toBeInstanceOf(ForbiddenError);

    queryMock.mockResolvedValueOnce(pgResult([{ found: true, builtin: true, actor_holds: false }]));
    await expect(deleteRole(fakePool, admin, ROLE_ID)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("refuses to edit a role the actor holds", async () => {
    queryMock.mockResolvedValueOnce(pgResult([flagsRow({ actor_holds: true, id: null })]));
    await expect(
      updateRole(fakePool, roleManager, ROLE_ID, { actions: ["customerScores.view"] }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    queryMock.mockResolvedValueOnce(pgResult([{ found: true, builtin: false, actor_holds: true }]));
    await expect(deleteRole(fakePool, roleManager, ROLE_ID)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("refuses a non-Admin renaming, narrowing or clearing a console role broader than their own", async () => {
    const broader = flagsRow({ current_subset: false, id: null, kind: "console" });
    queryMock.mockResolvedValue(pgResult([broader]));

    await expect(updateRole(fakePool, roleManager, ROLE_ID, { name: "Lesser" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      updateRole(fakePool, roleManager, ROLE_ID, { actions: ["roles.view"] }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(updateRole(fakePool, roleManager, ROLE_ID, { actions: [] })).rejects.toBeInstanceOf(ForbiddenError);
    expect(queryMock.mock.calls[2][1]).toEqual([ROLE_ID, USER_ID, null, false, roleManager.consoleActions, null, []]);
  });

  it("passes the actor's Admin flag so an Admin may edit any console role", async () => {
    queryMock.mockResolvedValueOnce(pgResult([flagsRow({ kind: "console", current_actions: ["roles.manage"] })]));

    await updateRole(fakePool, admin, ROLE_ID, { name: "Grantor" });

    expect(queryMock.mock.calls[0][1].slice(3)).toEqual([true, admin.consoleActions]);
  });

  it("rejects actions of the other kind than the role's", async () => {
    queryMock.mockResolvedValueOnce(pgResult([flagsRow({ kind_matches: false, id: null })]));

    await expect(updateRole(fakePool, admin, ROLE_ID, { actions: ["tenants.view"] })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("returns 409 for a duplicate name", async () => {
    queryMock.mockRejectedValueOnce({ code: UNIQUE_VIOLATION, constraint: "roles_kind_name_key" });

    await expect(updateRole(fakePool, admin, ROLE_ID, { name: "Viewer" })).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("deleteRole", () => {
  it("deletes an unheld custom role", async () => {
    queryMock.mockResolvedValueOnce(pgResult([{ found: true, builtin: false, actor_holds: false }]));

    await deleteRole(fakePool, roleManager, ROLE_ID);

    expect(queryMock.mock.calls[0][1]).toEqual([ROLE_ID, USER_ID, false, roleManager.consoleActions]);
  });

  it("refuses a non-Admin deleting a console role broader than their own", async () => {
    queryMock.mockResolvedValueOnce(
      pgResult([{ found: true, builtin: false, actor_holds: false, current_subset: false }]),
    );

    await expect(deleteRole(fakePool, roleManager, ROLE_ID)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("returns 404 for an unknown role", async () => {
    queryMock.mockResolvedValueOnce(pgResult([{ found: false, builtin: false, actor_holds: false }]));

    await expect(deleteRole(fakePool, admin, ROLE_ID)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("returns 409 when deleting a role in use", async () => {
    queryMock.mockRejectedValueOnce({ code: FOREIGN_KEY_VIOLATION, constraint: "user_brand_roles_role_fkey" });

    await expect(deleteRole(fakePool, admin, ROLE_ID)).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("listRoleAssignments", () => {
  it("refuses an actor without users.view before querying", async () => {
    const actor = actorWith(["roles.view"]);

    await expect(listRoleAssignments(fakePool, actor, ROLE_ID)).rejects.toBeInstanceOf(ForbiddenError);

    expect(queryMock).not.toHaveBeenCalled();
  });

  it("throws NotFound for an unknown role", async () => {
    queryMock.mockResolvedValueOnce(pgResult([{ found: false, user_id: null }]));

    await expect(listRoleAssignments(fakePool, roleManager, ROLE_ID)).rejects.toBeInstanceOf(NotFoundError);
    expect(queryMock.mock.calls[0][1]).toEqual([ROLE_ID]);
  });

  it("returns an empty list for a role nobody holds", async () => {
    queryMock.mockResolvedValueOnce(pgResult([{ found: true, user_id: null }]));

    expect(await listRoleAssignments(fakePool, roleManager, ROLE_ID)).toEqual([]);
  });

  it("maps console and brand rows", async () => {
    queryMock.mockResolvedValueOnce(
      pgResult([
        { found: true, user_id: USER_ID, email: "a@x.com", display_name: null, status: "active", brand_id: null, brand_name: null, tenant_name: null },
        { found: true, user_id: ROLE_ID, email: "b@x.com", display_name: "Bea", status: "invited", brand_id: USER_ID, brand_name: "Alpha", tenant_name: "Group" },
      ]),
    );

    const rows = await listRoleAssignments(fakePool, roleManager, ROLE_ID);

    expect(rows).toEqual([
      { userId: USER_ID, email: "a@x.com", displayName: null, status: "active", brandId: null, brandName: null, tenantName: null },
      { userId: ROLE_ID, email: "b@x.com", displayName: "Bea", status: "invited", brandId: USER_ID, brandName: "Alpha", tenantName: "Group" },
    ]);
  });
});

import type { BrandAction, ConsoleAction } from "@bonlift-ai/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../errors.js";
import { pgResult } from "../utils/pg.test-helpers.js";
import { CHECK_VIOLATION } from "../utils/pgErrors.js";
import type { RequestAccess } from "./authorization.service.js";
import {
  addBrandMember,
  listBrandMembers,
  listUserBrandRoles,
  removeBrandMember,
  setBrandMember,
} from "./brandMember.service.js";

const BRAND_ID = "11111111-1111-1111-1111-111111111111";
const ACTOR_ID = "22222222-2222-2222-2222-222222222222";
const TARGET_ID = "33333333-3333-3333-3333-333333333333";
const ROLE_ID = "44444444-4444-4444-4444-444444444444";
const TENANT_ID = "55555555-5555-5555-5555-555555555555";

const poolQueryMock = vi.fn();
const fakePool = { query: poolQueryMock } as any;

function actorWith(consoleActions: ConsoleAction[], email = "lead@x.com"): RequestAccess {
  return { user: { id: ACTOR_ID, email, displayName: null }, isAdmin: false, consoleActions };
}

const brandLead = actorWith([]);
const LEAD_BRAND_ACTIONS: BrandAction[] = ["members.view", "members.manage"];
const provisioner = actorWith(["users.view", "users.assignBrandRoles"], "ops@x.com");

function memberRow(overrides: Record<string, unknown> = {}) {
  return {
    user_id: TARGET_ID,
    email: "bob@x.com",
    display_name: "Bob",
    status: "active",
    role_id: ROLE_ID,
    role_name: "Viewer",
    ...overrides,
  };
}

const expectedMember = {
  userId: TARGET_ID,
  email: "bob@x.com",
  displayName: "Bob",
  status: "active",
  roleId: ROLE_ID,
  roleName: "Viewer",
};

function writeFlags(overrides: Record<string, unknown> = {}) {
  return {
    brand_found: true,
    role_found: true,
    target_found: true,
    target_disabled: false,
    new_subset: true,
    current_subset: true,
    written: true,
    ...memberRow(),
    ...overrides,
  };
}

beforeEach(() => {
  poolQueryMock.mockReset();
});

describe("listBrandMembers", () => {
  it("maps each member with their role on the brand", async () => {
    poolQueryMock.mockResolvedValueOnce(pgResult([{ brand_found: true, ...memberRow() }]));

    expect(await listBrandMembers(fakePool, BRAND_ID)).toEqual([expectedMember]);
    expect(poolQueryMock.mock.calls[0][1]).toEqual([BRAND_ID]);
  });

  it("returns an empty list for a brand with no members", async () => {
    poolQueryMock.mockResolvedValueOnce(
      pgResult([{ brand_found: true, ...memberRow({ user_id: null, role_id: null }) }]),
    );

    expect(await listBrandMembers(fakePool, BRAND_ID)).toEqual([]);
  });

  it("returns 404 for an unknown or deleted brand", async () => {
    poolQueryMock.mockResolvedValueOnce(pgResult([]));

    await expect(listBrandMembers(fakePool, BRAND_ID)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("listUserBrandRoles", () => {
  it("maps each brand role of the user", async () => {
    poolQueryMock.mockResolvedValueOnce(
      pgResult([
        {
          user_found: true,
          brand_id: BRAND_ID,
          brand_name: "Brand A",
          tenant_id: TENANT_ID,
          tenant_name: "Tenant A",
          role_id: ROLE_ID,
          role_name: "Viewer",
        },
      ]),
    );

    expect(await listUserBrandRoles(fakePool, TARGET_ID)).toEqual([
      {
        brandId: BRAND_ID,
        brandName: "Brand A",
        tenantId: TENANT_ID,
        tenantName: "Tenant A",
        roleId: ROLE_ID,
        roleName: "Viewer",
      },
    ]);
  });

  it("returns an empty list for a user with no brand roles", async () => {
    poolQueryMock.mockResolvedValueOnce(pgResult([{ user_found: true, brand_id: null }]));

    expect(await listUserBrandRoles(fakePool, TARGET_ID)).toEqual([]);
  });

  it("returns 404 for an unknown user", async () => {
    poolQueryMock.mockResolvedValueOnce(pgResult([]));

    await expect(listUserBrandRoles(fakePool, TARGET_ID)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("setBrandMember", () => {
  it("refuses to change your own brand role", async () => {
    const OWN_ID_UPPERCASE = "AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA";
    const lowercaseActor = { ...provisioner, user: { ...provisioner.user, id: OWN_ID_UPPERCASE.toLowerCase() } };

    await expect(
      setBrandMember(fakePool, lowercaseActor, null, BRAND_ID, OWN_ID_UPPERCASE, ROLE_ID),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(removeBrandMember(fakePool, brandLead, LEAD_BRAND_ACTIONS, BRAND_ID, ACTOR_ID)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(poolQueryMock).not.toHaveBeenCalled();
  });

  it("assigns the role in one statement through members.manage, with the actor's brand actions as the limit", async () => {
    poolQueryMock.mockResolvedValueOnce(pgResult([writeFlags()]));

    const member = await setBrandMember(fakePool, brandLead, LEAD_BRAND_ACTIONS, BRAND_ID, TARGET_ID, ROLE_ID);

    expect(member).toEqual(expectedMember);
    expect(poolQueryMock.mock.calls[0][1]).toEqual([BRAND_ID, TARGET_ID, ROLE_ID, ACTOR_ID, false, LEAD_BRAND_ACTIONS]);
  });

  it("through members.manage, refuses a role with actions the actor lacks on this brand", async () => {
    poolQueryMock.mockResolvedValueOnce(pgResult([writeFlags({ new_subset: false, written: false })]));

    await expect(
      setBrandMember(fakePool, brandLead, LEAD_BRAND_ACTIONS, BRAND_ID, TARGET_ID, ROLE_ID),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("through members.manage, refuses replacing or removing a member whose current role exceeds the actor's", async () => {
    poolQueryMock
      .mockResolvedValueOnce(pgResult([writeFlags({ current_subset: false, written: false })]))
      .mockResolvedValueOnce(pgResult([writeFlags({ current_subset: false, written: false })]));

    await expect(
      setBrandMember(fakePool, brandLead, LEAD_BRAND_ACTIONS, BRAND_ID, TARGET_ID, ROLE_ID),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      removeBrandMember(fakePool, brandLead, LEAD_BRAND_ACTIONS, BRAND_ID, TARGET_ID),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("through users.assignBrandRoles, assigns any brand role", async () => {
    poolQueryMock.mockResolvedValueOnce(pgResult([writeFlags({ new_subset: false, current_subset: false })]));

    const member = await setBrandMember(fakePool, provisioner, null, BRAND_ID, TARGET_ID, ROLE_ID);

    expect(member).toEqual(expectedMember);
    expect(poolQueryMock.mock.calls[0][1]).toEqual([BRAND_ID, TARGET_ID, ROLE_ID, ACTOR_ID, true, []]);
  });

  it("uses the console branch when the actor holds users.assignBrandRoles, even with a brand role", async () => {
    poolQueryMock.mockResolvedValueOnce(pgResult([writeFlags({ new_subset: false })]));

    await setBrandMember(fakePool, provisioner, ["members.view"], BRAND_ID, TARGET_ID, ROLE_ID);

    expect(poolQueryMock.mock.calls[0][1][4]).toBe(true);
  });

  it("returns 404 for an actor with neither the console action nor a role on the brand", async () => {
    await expect(setBrandMember(fakePool, brandLead, null, BRAND_ID, TARGET_ID, ROLE_ID)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(poolQueryMock).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown user or a console role id", async () => {
    poolQueryMock
      .mockResolvedValueOnce(pgResult([writeFlags({ target_found: false, written: false })]))
      .mockResolvedValueOnce(pgResult([writeFlags({ role_found: false, written: false })]));

    await expect(setBrandMember(fakePool, provisioner, null, BRAND_ID, TARGET_ID, ROLE_ID)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(setBrandMember(fakePool, provisioner, null, BRAND_ID, TARGET_ID, ROLE_ID)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(poolQueryMock.mock.calls[0][0]).toMatch(/kind = 'brand'/);
  });

  it("returns 404 for a deleted brand on the console branch", async () => {
    poolQueryMock.mockResolvedValueOnce(pgResult([writeFlags({ brand_found: false, written: false })]));

    await expect(setBrandMember(fakePool, provisioner, null, BRAND_ID, TARGET_ID, ROLE_ID)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe("removeBrandMember", () => {
  it("removes the member in one statement", async () => {
    poolQueryMock.mockResolvedValueOnce(pgResult([writeFlags()]));

    await removeBrandMember(fakePool, brandLead, LEAD_BRAND_ACTIONS, BRAND_ID, TARGET_ID);

    expect(poolQueryMock.mock.calls[0][0]).toMatch(/DELETE FROM user_brand_roles/);
    expect(poolQueryMock.mock.calls[0][1]).toEqual([BRAND_ID, TARGET_ID, false, LEAD_BRAND_ACTIONS]);
  });

  it("returns 404 for a user who is not a member of the brand", async () => {
    poolQueryMock.mockResolvedValueOnce(pgResult([writeFlags({ target_found: false, written: false })]));

    await expect(removeBrandMember(fakePool, provisioner, null, BRAND_ID, TARGET_ID)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe("addBrandMember", () => {
  const body = { email: "bob@x.com", displayName: "Bob", roleId: ROLE_ID };

  it("adds a brand-new email as an invited user", async () => {
    poolQueryMock.mockResolvedValueOnce(pgResult([writeFlags(memberRow({ status: "invited" }))]));

    const member = await addBrandMember(fakePool, brandLead, LEAD_BRAND_ACTIONS, BRAND_ID, body);

    expect(member).toEqual({ ...expectedMember, status: "invited" });
    const [sql, params] = poolQueryMock.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO users/);
    expect(sql).toMatch(/ON CONFLICT \(email\) DO NOTHING/);
    expect(sql).toMatch(/INSERT INTO user_brand_roles/);
    expect(params).toEqual([BRAND_ID, "bob@x.com", ROLE_ID, ACTOR_ID, false, LEAD_BRAND_ACTIONS, "Bob"]);
  });

  it("rejects a disabled user with 409", async () => {
    poolQueryMock.mockResolvedValueOnce(pgResult([writeFlags({ target_disabled: true, written: false })]));

    await expect(addBrandMember(fakePool, brandLead, LEAD_BRAND_ACTIONS, BRAND_ID, body)).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("refuses your own email", async () => {
    await expect(
      addBrandMember(fakePool, brandLead, LEAD_BRAND_ACTIONS, BRAND_ID, { ...body, email: "Lead@X.com" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(poolQueryMock).not.toHaveBeenCalled();
  });

  it("lowercases the email", async () => {
    poolQueryMock.mockResolvedValueOnce(pgResult([writeFlags()]));

    await addBrandMember(fakePool, provisioner, null, BRAND_ID, { email: "Bob@X.com", roleId: ROLE_ID });

    expect(poolQueryMock.mock.calls[0][1]).toEqual([BRAND_ID, "bob@x.com", ROLE_ID, ACTOR_ID, true, [], null]);
  });

  it("through members.manage, refuses a role the actor lacks or replacing a broader current role", async () => {
    poolQueryMock
      .mockResolvedValueOnce(pgResult([writeFlags({ new_subset: false, written: false })]))
      .mockResolvedValueOnce(pgResult([writeFlags({ current_subset: false, written: false })]));

    await expect(addBrandMember(fakePool, brandLead, LEAD_BRAND_ACTIONS, BRAND_ID, body)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(addBrandMember(fakePool, brandLead, LEAD_BRAND_ACTIONS, BRAND_ID, body)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("returns 404 for a console role id", async () => {
    poolQueryMock.mockResolvedValueOnce(pgResult([writeFlags({ role_found: false, written: false })]));

    await expect(addBrandMember(fakePool, provisioner, null, BRAND_ID, body)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("returns 409 when the flags pass but a racing insert hid the user", async () => {
    poolQueryMock.mockResolvedValueOnce(pgResult([writeFlags({ written: false, user_id: null })]));

    await expect(addBrandMember(fakePool, provisioner, null, BRAND_ID, body)).rejects.toBeInstanceOf(ConflictError);
  });

  it("returns 400 for an invalid email", async () => {
    await expect(
      addBrandMember(fakePool, provisioner, null, BRAND_ID, { email: "not-an-email", roleId: ROLE_ID }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(poolQueryMock).not.toHaveBeenCalled();
  });

  it("maps the email lowercase check to a validation error", async () => {
    poolQueryMock.mockRejectedValueOnce({ code: CHECK_VIOLATION, constraint: "users_email_check" });

    await expect(addBrandMember(fakePool, provisioner, null, BRAND_ID, body)).rejects.toBeInstanceOf(ValidationError);
  });
});

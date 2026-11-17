import { describe, expect, it } from "vitest";
import { applySaveStep, diffBrandRoles, planUserSave, type UserEditState } from "./user-save-plan";

const ROLE_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ROLE_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const BRAND_1 = "11111111-1111-1111-1111-111111111111";
const BRAND_2 = "22222222-2222-2222-2222-222222222222";
const BRAND_3 = "33333333-3333-3333-3333-333333333333";

const baseline: UserEditState = {
  displayName: "Bob",
  consoleRoleId: ROLE_A,
  brandRoles: [
    { brandId: BRAND_1, roleId: ROLE_A },
    { brandId: BRAND_2, roleId: ROLE_A },
  ],
};

describe("diffBrandRoles", () => {
  it("splits staged roles into removals, changes and additions", () => {
    const staged = [
      { brandId: BRAND_2, roleId: ROLE_B },
      { brandId: BRAND_3, roleId: ROLE_A },
    ];

    expect(diffBrandRoles(baseline.brandRoles, staged)).toEqual({
      removals: [BRAND_1],
      changes: [{ brandId: BRAND_2, roleId: ROLE_B }],
      additions: [{ brandId: BRAND_3, roleId: ROLE_A }],
    });
  });

  it("finds nothing when the staged roles match the baseline", () => {
    expect(diffBrandRoles(baseline.brandRoles, [...baseline.brandRoles].reverse())).toEqual({
      removals: [],
      changes: [],
      additions: [],
    });
  });
});

describe("planUserSave", () => {
  it("plans nothing when nothing changed", () => {
    expect(planUserSave(baseline, { ...baseline, displayName: "  Bob " })).toEqual([]);
  });

  it("orders name, console role, removals, changes, then additions", () => {
    const staged: UserEditState = {
      displayName: "Robert",
      consoleRoleId: ROLE_B,
      brandRoles: [
        { brandId: BRAND_3, roleId: ROLE_B },
        { brandId: BRAND_2, roleId: ROLE_B },
      ],
    };

    expect(planUserSave(baseline, staged)).toEqual([
      { kind: "name", displayName: "Robert" },
      { kind: "consoleRole", roleId: ROLE_B },
      { kind: "removeBrandRole", brandId: BRAND_1 },
      { kind: "changeBrandRole", brandId: BRAND_2, roleId: ROLE_B },
      { kind: "addBrandRole", brandId: BRAND_3, roleId: ROLE_B },
    ]);
  });

  it("sends a blank name as null and None as a null console role", () => {
    expect(planUserSave(baseline, { ...baseline, displayName: "   ", consoleRoleId: null })).toEqual([
      { kind: "name", displayName: null },
      { kind: "consoleRole", roleId: null },
    ]);
  });

  it("plans only the steps left after the saved ones are applied to the baseline", () => {
    const staged: UserEditState = {
      displayName: "Robert",
      consoleRoleId: ROLE_B,
      brandRoles: [{ brandId: BRAND_3, roleId: ROLE_A }],
    };
    const [nameStep, consoleStep] = planUserSave(baseline, staged);
    const refreshed = applySaveStep(applySaveStep(baseline, nameStep), consoleStep);

    expect(planUserSave(refreshed, staged)).toEqual([
      { kind: "removeBrandRole", brandId: BRAND_1 },
      { kind: "removeBrandRole", brandId: BRAND_2 },
      { kind: "addBrandRole", brandId: BRAND_3, roleId: ROLE_A },
    ]);
  });
});

describe("applySaveStep", () => {
  it("clears the name when the saved name is null", () => {
    expect(applySaveStep(baseline, { kind: "name", displayName: null }).displayName).toBe("");
  });

  it("sets and clears the console role", () => {
    const set = applySaveStep(baseline, { kind: "consoleRole", roleId: ROLE_B });
    expect(set.consoleRoleId).toBe(ROLE_B);
    expect(applySaveStep(set, { kind: "consoleRole", roleId: null }).consoleRoleId).toBeNull();
  });

  it("keeps a failed addition plannable when only the earlier steps are applied", () => {
    const staged: UserEditState = {
      ...baseline,
      displayName: "Robert",
      brandRoles: [...baseline.brandRoles, { brandId: BRAND_3, roleId: ROLE_B }],
    };
    const [nameStep, addStep] = planUserSave(baseline, staged);
    const refreshed = applySaveStep(baseline, nameStep);

    expect(addStep).toEqual({ kind: "addBrandRole", brandId: BRAND_3, roleId: ROLE_B });
    expect(planUserSave(refreshed, staged)).toEqual([addStep]);
  });

  it("removes, changes and adds brand roles", () => {
    const removed = applySaveStep(baseline, { kind: "removeBrandRole", brandId: BRAND_1 });
    const changed = applySaveStep(removed, { kind: "changeBrandRole", brandId: BRAND_2, roleId: ROLE_B });
    const added = applySaveStep(changed, { kind: "addBrandRole", brandId: BRAND_3, roleId: ROLE_A });

    expect(added.brandRoles).toEqual([
      { brandId: BRAND_2, roleId: ROLE_B },
      { brandId: BRAND_3, roleId: ROLE_A },
    ]);
  });
});

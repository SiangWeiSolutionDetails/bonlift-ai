import { describe, expect, it } from "vitest";
import { buildInviteBody, hasAnyRole } from "./invite-request";

const ROLE = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const BRAND = "11111111-1111-1111-1111-111111111111";

const empty = { email: " a@b.com ", displayName: "  ", consoleRoleId: null, brandRoles: [] };

describe("hasAnyRole", () => {
  it("is false without a console role or brand roles", () => {
    expect(hasAnyRole(empty)).toBe(false);
  });

  it("is true with only a console role", () => {
    expect(hasAnyRole({ ...empty, consoleRoleId: ROLE })).toBe(true);
  });

  it("is true with only a brand role", () => {
    expect(hasAnyRole({ ...empty, brandRoles: [{ brandId: BRAND, roleId: ROLE }] })).toBe(true);
  });
});

describe("buildInviteBody", () => {
  it("trims the email and omits empty optional fields", () => {
    expect(buildInviteBody(empty)).toEqual({ email: "a@b.com" });
  });

  it("includes the name, console role and brand roles when set", () => {
    const body = buildInviteBody({
      email: "a@b.com",
      displayName: " Ann ",
      consoleRoleId: ROLE,
      brandRoles: [{ brandId: BRAND, roleId: ROLE }],
    });
    expect(body).toEqual({
      email: "a@b.com",
      displayName: "Ann",
      consoleRoleId: ROLE,
      brandRoles: [{ brandId: BRAND, roleId: ROLE }],
    });
  });
});

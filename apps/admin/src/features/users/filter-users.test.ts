import { describe, expect, it } from "vitest";
import { filterUsers } from "./filter-users";

const users = [
  { email: "alice@example.com", displayName: "Alice Tan" },
  { email: "bob@example.com", displayName: null },
];

describe("filterUsers", () => {
  it("returns the list untouched for blank text", () => {
    expect(filterUsers(users, "   ")).toBe(users);
  });

  it("returns undefined while the list is loading", () => {
    expect(filterUsers(undefined, "a")).toBeUndefined();
  });

  it("matches email case-insensitively and trimmed", () => {
    expect(filterUsers(users, "  BOB@ ")).toEqual([users[1]]);
  });

  it("matches display name", () => {
    expect(filterUsers(users, "tan")).toEqual([users[0]]);
  });

  it("does not match a null display name", () => {
    expect(filterUsers(users, "null")).toEqual([]);
  });
});

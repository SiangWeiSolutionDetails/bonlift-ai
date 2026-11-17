import { describe, expect, it } from "vitest";
import { nameConfirmationRedirect, safeReturnTo } from "./name-confirmation";

describe("nameConfirmationRedirect", () => {
  it("sends a user who still has to confirm their name to the welcome page", () => {
    expect(nameConfirmationRedirect({ needsNameConfirmation: true }, false)).toBe("/welcome");
  });

  it("leaves the welcome page alone while the name is unconfirmed", () => {
    expect(nameConfirmationRedirect({ needsNameConfirmation: true }, true)).toBeNull();
  });

  it("sends a confirmed user away from the welcome page", () => {
    expect(nameConfirmationRedirect({ needsNameConfirmation: false }, true)).toBe("/");
  });

  it("does nothing for a confirmed user elsewhere", () => {
    expect(nameConfirmationRedirect({ needsNameConfirmation: false }, false)).toBeNull();
  });
});

describe("safeReturnTo", () => {
  it("keeps a same-origin path with its query", () => {
    expect(safeReturnTo("/users?q=a")).toBe("/users?q=a");
  });

  it("falls back to the home page when missing or not a local path", () => {
    expect(safeReturnTo(undefined)).toBe("/");
    expect(safeReturnTo("https://evil.example")).toBe("/");
    expect(safeReturnTo("//evil.example")).toBe("/");
    expect(safeReturnTo("/\\evil.example")).toBe("/");
  });
});

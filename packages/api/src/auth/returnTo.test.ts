import { describe, expect, it } from "vitest";
import { safeReturnTo } from "./returnTo.js";

describe("safeReturnTo", () => {
  it("keeps a relative path with a query", () => {
    expect(safeReturnTo("/brands?x=1")).toEqual("/brands?x=1");
  });

  it("keeps a plain relative path", () => {
    expect(safeReturnTo("/tenants")).toEqual("/tenants");
  });

  it.each([
    ["a protocol-relative URL", "//evil.com"],
    ["a backslash after the slash", "/\\evil.com"],
    ["an absolute URL", "https://evil.com"],
    ["a javascript URL", "javascript:alert(1)"],
    ["an empty string", ""],
    ["undefined", undefined],
    ["a number", 42],
    ["a path without a leading slash", "brands"],
    ["a dot segment before a double slash", "/.//evil.com"],
    ["a parent segment before a double slash", "/..//evil.com"],
    ["a resolved parent segment before a double slash", "/a/..//evil.com"],
    ["an encoded dot segment before a double slash", "/%2e//evil.com"],
  ])("falls back to / for %s", (_label, value) => {
    expect(safeReturnTo(value)).toEqual("/");
  });
});

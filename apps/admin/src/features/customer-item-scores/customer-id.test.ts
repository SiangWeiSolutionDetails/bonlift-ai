import { describe, expect, it } from "vitest";
import { shortCustomerId } from "./customer-id";

describe("shortCustomerId", () => {
  it("keeps the prefix and the first and last 4 hex characters of a hash", () => {
    const hash = `h1:3fa9${"0".repeat(56)}c21b`;

    expect(shortCustomerId(hash)).toBe("h1:3fa9…c21b");
  });

  it.each([
    ["a value without the hash prefix", "C1"],
    ["a hash too short to shorten", "h1:3fa9c21b"],
  ])("returns %s unchanged", (_label, value) => {
    expect(shortCustomerId(value)).toBe(value);
  });
});

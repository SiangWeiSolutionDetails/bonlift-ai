import { describe, expect, it } from "vitest";
import { isValidUuid } from "./uuid.js";

describe("isValidUuid", () => {
  it("returns false for a segment with the wrong length", () => {
    expect(isValidUuid("1234567-1234-1234-1234-123456789012")).toEqual(false);
  });

  it("returns false for an empty string", () => {
    expect(isValidUuid("")).toEqual(false);
  });

  it("returns false when hyphens are missing entirely", () => {
    expect(isValidUuid("550e8400e29b41d4a716446655440000")).toEqual(false);
  });

  it("returns true for uppercase hex characters", () => {
    expect(isValidUuid("550E8400-E29B-41D4-A716-446655440000")).toEqual(
      true,
    );
  });

  it("returns true for a valid uuid", () => {
    expect(isValidUuid("550e8400-e29b-41d4-a716-446655440000")).toEqual(
      true,
    );
  });
});

import { describe, expect, it } from "vitest";
import { buildAssignments } from "./sql.js";

describe("buildAssignments", () => {
  it("builds column/placeholder/setClause strings for a single field", () => {
    const result = buildAssignments({ name: "Test Brand" });

    expect(result.columns).toBe("name");
    expect(result.placeholders).toBe("$1");
    expect(result.setClause).toBe("name = $1");
    expect(result.values).toEqual(["Test Brand"]);
  });

  it("builds column/placeholder/setClause strings for multiple fields, preserving order", () => {
    const result = buildAssignments({ name: "Test Brand", isActive: false });

    expect(result.columns).toBe("name, isActive");
    expect(result.placeholders).toBe("$1, $2");
    expect(result.setClause).toBe("name = $1, isActive = $2");
    expect(result.values).toEqual(["Test Brand", false]);
  });

  it("returns empty fragments for an empty object", () => {
    const result = buildAssignments({});

    expect(result.columns).toBe("");
    expect(result.placeholders).toBe("");
    expect(result.setClause).toBe("");
    expect(result.values).toEqual([]);
  });

  it("filters out null values the same as undefined", () => {
    const result = buildAssignments({ name: null, isActive: false });

    expect(result.columns).toBe("isActive");
    expect(result.placeholders).toBe("$1");
    expect(result.setClause).toBe("isActive = $1");
    expect(result.values).toEqual([false]);
  });

  it("filters out a mix of null and undefined, keeping real values including false", () => {
    const result = buildAssignments({
      name: undefined,
      isActive: false,
      category: null,
      score: 0,
    });

    expect(result.columns).toBe("isActive, score");
    expect(result.placeholders).toBe("$1, $2");
    expect(result.setClause).toBe("isActive = $1, score = $2");
    expect(result.values).toEqual([false, 0]);
  });
});

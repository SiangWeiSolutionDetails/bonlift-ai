import { describe, expect, it } from "vitest";
import { filterAssignments } from "./filter-assignments";

const base = { email: "", displayName: null, brandName: null, tenantName: null };
const assignments = [
  { ...base, email: "alice@example.com", displayName: "Alice", brandName: "Kopi", tenantName: "Acme" },
  { ...base, email: "bob@example.com", brandName: "Teh", tenantName: "Globex" },
  { ...base, email: "carol@example.com" },
];

describe("filterAssignments", () => {
  it("returns the list untouched for blank text", () => {
    expect(filterAssignments(assignments, " ")).toBe(assignments);
  });

  it("matches name and email", () => {
    expect(filterAssignments(assignments, "ALICE")).toEqual([assignments[0]]);
    expect(filterAssignments(assignments, "bob@")).toEqual([assignments[1]]);
  });

  it("matches brand and tenant", () => {
    expect(filterAssignments(assignments, " kopi ")).toEqual([assignments[0]]);
    expect(filterAssignments(assignments, "globex")).toEqual([assignments[1]]);
  });

  it("returns nothing when no field matches", () => {
    expect(filterAssignments(assignments, "zzz")).toEqual([]);
  });
});

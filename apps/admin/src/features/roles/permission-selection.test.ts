import { describe, expect, it } from "vitest";
import { groupState, toggleGroup } from "./permission-selection";

const actions = ["a", "b", "c"];
const all = () => true;

describe("groupState", () => {
  it("is true when every action is selected", () => {
    expect(groupState(actions, new Set(["a", "b", "c"]))).toBe(true);
  });

  it("is indeterminate when some are selected", () => {
    expect(groupState(actions, new Set(["a"]))).toBe("indeterminate");
  });

  it("is false when none are selected", () => {
    expect(groupState(actions, new Set(["x"]))).toBe(false);
  });
});

describe("toggleGroup", () => {
  it("selects all enabled actions when partially selected", () => {
    const next = toggleGroup(actions, new Set(["a"]), all);
    expect([...next].sort()).toEqual(["a", "b", "c"]);
  });

  it("selects all enabled actions when none are selected", () => {
    const next = toggleGroup(actions, new Set(), all);
    expect([...next].sort()).toEqual(["a", "b", "c"]);
  });

  it("unselects all enabled actions when every enabled one is selected", () => {
    const next = toggleGroup(actions, new Set(["a", "b", "c", "x"]), all);
    expect([...next]).toEqual(["x"]);
  });

  it("leaves locked actions unchanged when selecting", () => {
    const next = toggleGroup(actions, new Set(), (key) => key !== "c");
    expect([...next].sort()).toEqual(["a", "b"]);
  });

  it("leaves locked actions unchanged when unselecting", () => {
    const next = toggleGroup(actions, new Set(["a", "b", "c"]), (key) => key !== "c");
    expect([...next]).toEqual(["c"]);
  });

  it("unselects enabled actions when the only unselected ones are locked", () => {
    const next = toggleGroup(actions, new Set(["a", "b"]), (key) => key !== "c");
    expect([...next]).toEqual([]);
  });

  it("does not change when no action is enabled", () => {
    const selected = new Set(["a"]);
    expect(toggleGroup(actions, selected, () => false)).toEqual(selected);
  });
});

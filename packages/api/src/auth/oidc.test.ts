import { describe, expect, it } from "vitest";
import { promptParams } from "./oidc.js";

describe("promptParams", () => {
  it("asks Google for its account chooser when switching account", () => {
    expect(promptParams(true)).toEqual({ prompt: "select_account" });
  });

  it("adds no prompt for a normal sign-in", () => {
    expect(promptParams(false)).toEqual({});
  });
});

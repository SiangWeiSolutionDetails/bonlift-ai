import { describe, expect, it } from "vitest";
import { hintParams, promptParams } from "./oidc.js";

describe("promptParams", () => {
  it("asks Google for its account chooser when switching account", () => {
    expect(promptParams(true)).toEqual({ prompt: "select_account" });
  });

  it("adds no prompt for a normal sign-in", () => {
    expect(promptParams(false)).toEqual({});
  });
});

describe("hintParams", () => {
  it("passes the email to Google as login_hint", () => {
    expect(hintParams("a@example.com")).toEqual({ login_hint: "a@example.com" });
  });

  it("adds no hint when none is given", () => {
    expect(hintParams()).toEqual({});
  });

  it("combines with the account chooser prompt", () => {
    expect({ ...promptParams(true), ...hintParams("a@example.com") }).toEqual({
      prompt: "select_account",
      login_hint: "a@example.com",
    });
  });
});

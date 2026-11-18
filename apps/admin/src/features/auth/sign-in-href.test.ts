import { describe, expect, it } from "vitest";
import { signInHref } from "./api";

describe("signInHref", () => {
  it("returns to the page after a normal sign-in", () => {
    expect(signInHref("/b/x/outlets?tab=1")).toBe(
      "/api/auth/login/google?returnTo=%2Fb%2Fx%2Foutlets%3Ftab%3D1",
    );
  });

  it("asks for Google's account chooser when switching account", () => {
    expect(signInHref("/", { selectAccount: true })).toBe(
      "/api/auth/login/google?returnTo=%2F&selectAccount=1",
    );
  });
});

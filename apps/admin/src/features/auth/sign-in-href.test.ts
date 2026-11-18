import { describe, expect, it } from "vitest";
import { signInHref } from "./api";

describe("signInHref", () => {
  it("returns to the page after a normal sign-in", () => {
    expect(signInHref("google", "/b/x/outlets?tab=1")).toBe(
      "/api/auth/login/google?returnTo=%2Fb%2Fx%2Foutlets%3Ftab%3D1",
    );
  });

  it("asks for Google's account chooser when switching account", () => {
    expect(signInHref("google", "/", { selectAccount: true })).toBe(
      "/api/auth/login/google?returnTo=%2F&selectAccount=1",
    );
  });

  it("pre-fills Google with the chosen account's email", () => {
    expect(signInHref("google", "/", { loginHint: "a+b@example.com" })).toBe(
      "/api/auth/login/google?returnTo=%2F&loginHint=a%2Bb%40example.com",
    );
  });

  it("sends Microsoft sign-in to the Microsoft login route", () => {
    expect(signInHref("microsoft", "/", { selectAccount: true })).toBe(
      "/api/auth/login/microsoft?returnTo=%2F&selectAccount=1",
    );
  });
});

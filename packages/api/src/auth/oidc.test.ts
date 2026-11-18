import { describe, expect, it } from "vitest";
import type { IDToken } from "openid-client";
import { UnauthorizedError } from "../errors.js";
import { hintParams, promptParams, toVerifiedIdentity } from "./oidc.js";

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

const CONSUMERS_TENANT_ID = "9188040d-6c67-4c5b-b112-36a304b66dad";
const WORK_TENANT_ID = "72f988bf-86f1-41af-91ab-2d7cd011db47";

function idToken(claims: Record<string, unknown>): IDToken {
  return { iss: "https://issuer", sub: "sub-1", aud: "client", exp: 0, iat: 0, email: "a@example.com", ...claims };
}

describe("toVerifiedIdentity", () => {
  it("maps the subject, email and name", () => {
    expect(toVerifiedIdentity("google", idToken({ email_verified: true, name: "Alice" }))).toEqual({
      provider: "google",
      subject: "sub-1",
      email: "a@example.com",
      emailVerified: true,
      name: "Alice",
    });
  });

  it.each([
    [true, true],
    [false, false],
    ["true", false],
    [undefined, false],
  ])("treats Google email_verified %s as verified %s", (emailVerified, verified) => {
    expect(toVerifiedIdentity("google", idToken({ email_verified: emailVerified })).emailVerified).toBe(verified);
  });

  it("ignores xms_edov and tid for Google", () => {
    const claims = idToken({ tid: CONSUMERS_TENANT_ID, xms_edov: true });

    expect(toVerifiedIdentity("google", claims).emailVerified).toBe(false);
  });

  it.each([
    ["a personal account", { tid: CONSUMERS_TENANT_ID }, true],
    ["a tenant that proved the email domain", { tid: WORK_TENANT_ID, xms_edov: true }, true],
    ["a tenant without xms_edov", { tid: WORK_TENANT_ID }, false],
    ["a tenant with xms_edov false", { tid: WORK_TENANT_ID, xms_edov: false }, false],
    ["a tenant with xms_edov \"1\"", { tid: WORK_TENANT_ID, xms_edov: "1" }, false],
    ["a tenant claiming email_verified", { tid: WORK_TENANT_ID, email_verified: true }, false],
    ["no tid", {}, false],
  ])("treats a Microsoft email from %s as verified %s", (_label, claims, verified) => {
    expect(toVerifiedIdentity("microsoft", idToken(claims)).emailVerified).toBe(verified);
  });

  it("never falls back to preferred_username for a Microsoft email", () => {
    const claims = idToken({ email: undefined, preferred_username: "a@example.com", tid: CONSUMERS_TENANT_ID });

    expect(() => toVerifiedIdentity("microsoft", claims)).toThrow(UnauthorizedError);
  });

  it("refuses missing claims", () => {
    expect(() => toVerifiedIdentity("google", undefined)).toThrow(UnauthorizedError);
  });
});

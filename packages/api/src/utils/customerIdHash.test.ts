import { CUSTOMER_ID_HASH_PREFIX, normaliseCustomerId } from "@bonlift-ai/contracts";
import { describe, expect, it } from "vitest";
import { hashCustomerId, toHashedCustomerId } from "./customerIdHash.js";

const SECRET = "test-secret-0123456789abcdef0123456789abcdef";

describe("normaliseCustomerId", () => {
  it.each([
    ["an 8-digit number", "65912345"],
    ["a 15-digit number", "123456789012345"],
    ["a Singapore mobile", "6591234567"],
  ])("accepts %s as a mobile number", (_label, raw) => {
    expect(normaliseCustomerId(raw)).toStrictEqual({ status: "valid", kind: "mobile", value: raw });
  });

  it("drops surrounding whitespace from a mobile number", () => {
    expect(normaliseCustomerId(" 6591234567\t")).toStrictEqual({
      status: "valid",
      kind: "mobile",
      value: "6591234567",
    });
  });

  it("trims and lower-cases an email", () => {
    expect(normaliseCustomerId("  Tan@Mail.COM ")).toStrictEqual({
      status: "valid",
      kind: "email",
      value: "tan@mail.com",
    });
  });

  it.each([
    ["too short", "6591234"],
    ["too long", "1234567890123456"],
    ["starting with 0", "06591234567"],
    ["with a leading +", "+6591234567"],
    ["with inner spaces", "65 9123 4567"],
    ["with the legacy name prefix", "tan-6591234567"],
    ["an email without a domain dot", "tan@mail"],
    ["an email with a space", "tan lee@mail.com"],
    ["an email over 254 characters", `${"a".repeat(250)}@b.com`],
    ["an email with a trailing dot", "tan@mail.com."],
    ["an email with an empty domain label", "tan@mail..com"],
    ["an email with a zero-width space", "tan​@mail.com"],
    ["an email with a control character", "tan\u0007@mail.com"],
  ])("rejects a value %s", (_label, raw) => {
    expect(normaliseCustomerId(raw)).toStrictEqual({ status: "invalid" });
  });

  it("gives a composed and a decomposed accent the same email", () => {
    const composed = normaliseCustomerId("café@mail.com");
    const decomposed = normaliseCustomerId("café@mail.com");

    expect(composed).toStrictEqual({ status: "valid", kind: "email", value: "café@mail.com" });
    expect(decomposed).toStrictEqual(composed);
  });

  it.each([
    ["missing", undefined],
    ["null", null],
    ["blank", " \r\n"],
  ])("treats a %s id as anonymous", (_label, raw) => {
    expect(normaliseCustomerId(raw)).toStrictEqual({ status: "anonymous" });
  });
});

describe("hashCustomerId", () => {
  it("returns the versioned hex HMAC, the same every time", () => {
    const hash = hashCustomerId(SECRET, "6591234567");

    expect(hash).toMatch(new RegExp(`^${CUSTOMER_ID_HASH_PREFIX}[0-9a-f]{64}$`));
    expect(hashCustomerId(SECRET, "6591234567")).toBe(hash);
  });

  it("differs by secret and by id", () => {
    const hash = hashCustomerId(SECRET, "6591234567");

    expect(hashCustomerId(`${SECRET}x`, "6591234567")).not.toBe(hash);
    expect(hashCustomerId(SECRET, "6591234568")).not.toBe(hash);
  });
});

describe("toHashedCustomerId", () => {
  it("hashes the normalised value, so differently cased emails match", () => {
    expect(toHashedCustomerId(SECRET, "Tan@Mail.com")).toStrictEqual({
      status: "hashed",
      id: hashCustomerId(SECRET, "tan@mail.com"),
    });
  });

  it.each([
    ["invalid", "tan-6591234567", { status: "invalid" }],
    ["anonymous", "", { status: "anonymous" }],
  ])("passes an %s id through unhashed", (_label, raw, expected) => {
    expect(toHashedCustomerId(SECRET, raw)).toStrictEqual(expected);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const VALID_SECRET = "a".repeat(64);

// The secret is cached per module, so each test loads a fresh copy of the module.
async function loadEnv() {
  vi.resetModules();
  return import("./env.js");
}

beforeEach(() => {
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("readCustomerIdSecret", () => {
  it.each([
    ["missing", undefined],
    ["shorter than 32 characters", "a".repeat(31)],
    ["using a character outside A-Z, a-z, 0-9, - and _", `${"a".repeat(40)}!`],
    ["the .env.example placeholder", `replace-with-${"a".repeat(32)}`],
  ])("refuses a secret that is %s, without echoing it", async (_label, value) => {
    vi.stubEnv("CUSTOMER_ID_SECRET", value);
    const { readCustomerIdSecret } = await loadEnv();

    expect(() => readCustomerIdSecret()).toThrow(/CUSTOMER_ID_SECRET must be set/);
    if (value) {
      expect(() => readCustomerIdSecret()).not.toThrow(new RegExp(value));
    }
  });

  it("returns a valid secret without surrounding whitespace", async () => {
    vi.stubEnv("CUSTOMER_ID_SECRET", ` ${VALID_SECRET} `);
    const { readCustomerIdSecret } = await loadEnv();

    expect(readCustomerIdSecret()).toBe(VALID_SECRET);
  });

  it("keeps the first secret it read, so a later change cannot split stored ids", async () => {
    vi.stubEnv("CUSTOMER_ID_SECRET", VALID_SECRET);
    const { readCustomerIdSecret } = await loadEnv();
    readCustomerIdSecret();

    vi.stubEnv("CUSTOMER_ID_SECRET", "b".repeat(64));

    expect(readCustomerIdSecret()).toBe(VALID_SECRET);
  });
});

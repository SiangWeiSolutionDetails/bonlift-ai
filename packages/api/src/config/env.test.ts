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

describe("readAuthConfig", () => {
  function stubAuthEnv(overrides: Record<string, string | undefined> = {}) {
    const values: Record<string, string | undefined> = {
      APP_BASE_URL: "http://localhost:5173",
      SESSION_COOKIE_SECRET: VALID_SECRET,
      GOOGLE_CLIENT_ID: "client-id.apps.googleusercontent.com",
      GOOGLE_CLIENT_SECRET: "client-secret",
      MICROSOFT_CLIENT_ID: "microsoft-client-id",
      MICROSOFT_CLIENT_SECRET: "microsoft-client-secret",
      ...overrides,
    };
    for (const [name, value] of Object.entries(values)) vi.stubEnv(name, value);
  }

  async function loadReadAuthConfig() {
    const { readAuthConfig, resetAuthConfigCache } = await import("./env.js");
    resetAuthConfigCache();
    return readAuthConfig;
  }

  it.each([
    "APP_BASE_URL",
    "SESSION_COOKIE_SECRET",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "MICROSOFT_CLIENT_ID",
    "MICROSOFT_CLIENT_SECRET",
  ])(
    "names %s when it is missing",
    async (name) => {
      stubAuthEnv({ [name]: undefined });
      const readAuthConfig = await loadReadAuthConfig();

      expect(() => readAuthConfig()).toThrow(name);
    },
  );

  it.each([
    ["shorter than 32 characters", "a".repeat(31)],
    ["the .env.example placeholder", `replace-with-${"a".repeat(32)}`],
  ])("refuses a SESSION_COOKIE_SECRET that is %s, without echoing it", async (_label, value) => {
    stubAuthEnv({ SESSION_COOKIE_SECRET: value });
    const readAuthConfig = await loadReadAuthConfig();

    expect(() => readAuthConfig()).toThrow(/SESSION_COOKIE_SECRET must be set/);
    expect(() => readAuthConfig()).not.toThrow(new RegExp(value));
  });

  it.each([
    ["a trailing slash", "http://localhost:5173/"],
    ["a path", "https://admin.example.com/app"],
    ["a non-http scheme", "ftp://admin.example.com"],
    ["no scheme", "admin.example.com"],
  ])("refuses an APP_BASE_URL with %s", async (_label, value) => {
    stubAuthEnv({ APP_BASE_URL: value });
    const readAuthConfig = await loadReadAuthConfig();

    expect(() => readAuthConfig()).toThrow(/APP_BASE_URL/);
  });

  it.each([
    ["https://admin.example.com", true],
    ["http://localhost:5173", false],
  ])("sets secureCookies for %s to %s", async (appBaseUrl, secureCookies) => {
    stubAuthEnv({ APP_BASE_URL: appBaseUrl });
    const readAuthConfig = await loadReadAuthConfig();

    expect(readAuthConfig()).toEqual({
      appBaseUrl,
      cookieSecret: VALID_SECRET,
      secureCookies,
      google: { clientId: "client-id.apps.googleusercontent.com", clientSecret: "client-secret" },
      microsoft: { clientId: "microsoft-client-id", clientSecret: "microsoft-client-secret" },
    });
  });

  it("keeps the first config it read", async () => {
    stubAuthEnv();
    const readAuthConfig = await loadReadAuthConfig();
    readAuthConfig();

    vi.stubEnv("GOOGLE_CLIENT_ID", "other-client-id");

    expect(readAuthConfig().google.clientId).toBe("client-id.apps.googleusercontent.com");
  });
});

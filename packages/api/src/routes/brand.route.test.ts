import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";

// Every request here is rejected by schema validation before the handler runs,
// so no database connection is needed.

const BRAND_ID = "11111111-1111-1111-1111-111111111111";

let app: FastifyInstance;

beforeAll(async () => {
  app = buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe("GET /brands", () => {
  it("rejects an unknown query parameter instead of ignoring it", async () => {
    const res = await app.inject({ url: "/brands?includeInactive=true" });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("VALIDATION_ERROR");
  });
});

describe("GET /brands/:brandId", () => {
  it("rejects a malformed brand id", async () => {
    const res = await app.inject({ url: "/brands/abc" });

    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain("brandId");
  });
});

describe("POST /brands", () => {
  it("rejects a missing name", async () => {
    const res = await app.inject({ method: "POST", url: "/brands", payload: {} });

    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain("name");
  });

  it("rejects an unknown field", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/brands",
      payload: { name: "test brand", isActive: false },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain("additional properties");
  });
});

describe("PATCH /brands/:brandId", () => {
  it("rejects an empty body", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/brands/${BRAND_ID}`,
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("VALIDATION_ERROR");
  });

  it("rejects a snake_case field instead of silently dropping it", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/brands/${BRAND_ID}`,
      payload: { is_active: false },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain("additional properties");
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";

// Every request here is rejected by schema validation before the handler runs,
// so no database connection is needed.

const BRAND_ID = "11111111-1111-1111-1111-111111111111";
const TENANT_ID = "44444444-4444-4444-4444-444444444444";
const VALID_CREATE_BODY = {
  tenantId: TENANT_ID,
  externalId: "pos-brand-1",
  name: "test brand",
};

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

  it("rejects a malformed tenant id filter", async () => {
    const res = await app.inject({ url: "/brands?tenantId=abc" });

    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain("tenantId");
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
  it.each(["tenantId", "externalId", "name"])(
    "rejects a missing %s",
    async (field) => {
      const { [field as keyof typeof VALID_CREATE_BODY]: _, ...payload } =
        VALID_CREATE_BODY;
      const res = await app.inject({ method: "POST", url: "/brands", payload });

      expect(res.statusCode).toBe(400);
      expect(res.json().message).toContain(field);
    },
  );

  it("rejects an unknown field", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/brands",
      payload: { ...VALID_CREATE_BODY, isActive: false },
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

  it.each([
    { field: "tenantId", value: TENANT_ID },
    { field: "externalId", value: "other" },
  ])("rejects $field in the body, since it is immutable", async ({ field, value }) => {
    const res = await app.inject({
      method: "PATCH",
      url: `/brands/${BRAND_ID}`,
      payload: { [field]: value },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain("additional properties");
  });
});

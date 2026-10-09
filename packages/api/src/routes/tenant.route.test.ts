import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";

// Every request here is rejected by schema validation before the handler runs,
// so no database connection is needed.

const TENANT_ID = "11111111-1111-1111-1111-111111111111";

let app: FastifyInstance;

beforeAll(async () => {
  app = buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe("GET /tenants", () => {
  it("rejects an unknown query parameter instead of ignoring it", async () => {
    const res = await app.inject({ url: "/tenants?includeInactive=true" });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("VALIDATION_ERROR");
  });
});

describe("GET /tenants/:tenantId", () => {
  it("rejects a malformed tenant id", async () => {
    const res = await app.inject({ url: "/tenants/abc" });

    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain("tenantId");
  });
});

describe("POST /tenants", () => {
  it("rejects a missing external id", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/tenants",
      payload: { name: "test tenant" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain("externalId");
  });

  it("rejects a missing name", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/tenants",
      payload: { externalId: "pos-tenant-1" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain("name");
  });

  it("rejects an unknown field", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/tenants",
      payload: { externalId: "pos-tenant-1", name: "test", isActive: false },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain("additional properties");
  });
});

describe("PATCH /tenants/:tenantId", () => {
  it("rejects an empty body", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/tenants/${TENANT_ID}`,
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("VALIDATION_ERROR");
  });

  it("rejects an externalId in the body, since it is immutable", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/tenants/${TENANT_ID}`,
      payload: { externalId: "other" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain("additional properties");
  });
});

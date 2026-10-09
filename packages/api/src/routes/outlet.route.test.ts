import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";

// Every request here is rejected by schema validation before the handler runs,
// so no database connection is needed.

const OUTLET_ID = "11111111-1111-1111-1111-111111111111";
const BRAND_ID = "33333333-3333-3333-3333-333333333333";
const TENANT_ID = "44444444-4444-4444-4444-444444444444";

let app: FastifyInstance;

beforeAll(async () => {
  app = buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe("GET /outlets", () => {
  it("rejects an unknown query parameter instead of ignoring it", async () => {
    const res = await app.inject({ url: `/outlets?brand_id=${BRAND_ID}` });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("VALIDATION_ERROR");
  });

  it("rejects a malformed brand id filter", async () => {
    const res = await app.inject({ url: "/outlets?brandId=abc" });

    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain("brandId");
  });

  it("rejects a tenantId filter, since outlets are scoped by brand", async () => {
    const res = await app.inject({ url: `/outlets?tenantId=${TENANT_ID}` });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("VALIDATION_ERROR");
  });
});

describe("POST /outlets", () => {
  it("rejects a missing external id", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/outlets",
      payload: { brandId: BRAND_ID, name: "test outlet" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain("externalId");
  });

  it("rejects a tenantId in the body, since outlets belong to a brand only", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/outlets",
      payload: {
        brandId: BRAND_ID,
        tenantId: TENANT_ID,
        externalId: "pos-outlet-1",
        name: "test outlet",
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain("additional properties");
  });
});

describe("PATCH /outlets/:outletId", () => {
  it("rejects a brandId in the body, since an outlet cannot change brand", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/outlets/${OUTLET_ID}`,
      payload: { brandId: BRAND_ID },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain("additional properties");
  });
});

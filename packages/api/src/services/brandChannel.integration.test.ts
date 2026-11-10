import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { NotFoundError, ValidationError } from "../errors.js";
import { getTestPool } from "../testing/testDb.js";
import { createBrandApiKey } from "./brandApiKey.service.js";
import { createBrand } from "./brand.service.js";
import { listBrandChannels, updateBrandChannel } from "./brandChannel.service.js";
import { getBrandUsage } from "./brandUsage.service.js";
import { createOutlet } from "./outlet.service.js";
import { createTenant } from "./tenant.service.js";

const UNKNOWN_ID = "00000000-0000-0000-0000-000000000000";

let app: FastifyInstance;
let brandId: string;
let outletId: string;

// The brand's mapping for a shared channel, switched on unless asked otherwise.
async function channelOf(code: string, forBrandId = brandId, isActive = true) {
  const { channels } = await listBrandChannels(getTestPool(), forBrandId);
  const channel = channels.find((candidate) => candidate.code === code);
  if (!channel) throw new Error(`No channel ${code}`);
  return updateBrandChannel(getTestPool(), forBrandId, channel.channelId, { isActive });
}

async function createOtherBrand() {
  const pool = getTestPool();
  const tenant = await createTenant(pool, { name: "Other Group" });
  return (await createBrand(pool, { tenantId: tenant.id, name: "Other" })).id;
}

async function createKey(channelId: string, name = "tqr-key") {
  return createBrandApiKey(getTestPool(), { brandId, name, channelId, createdBy: "test" });
}

function recommend(key: string, body: Record<string, unknown> = {}) {
  return app.inject({
    method: "POST",
    url: "/v1/recommendations",
    headers: { "x-api-key": key },
    payload: { outletId, cart: [], ...body },
  });
}

// The usage hook writes after the reply is sent, so wait until every call has its row.
async function waitForUsageRows(count: number) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const result = await getTestPool().query("SELECT count(*)::int AS n FROM serving_usage_events");
    if (result.rows[0].n >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Expected ${count} usage rows`);
}

beforeAll(async () => {
  app = buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  const pool = getTestPool();
  const tenant = await createTenant(pool, { name: "Acme Foods" });
  brandId = (await createBrand(pool, { tenantId: tenant.id, name: "Kopi House" })).id;
  outletId = (await createOutlet(pool, { brandId, name: "Boat Quay" })).id;
});

describe("brand channels (integration)", () => {
  it("maps a new brand to every shared channel, all switched off", async () => {
    const { channels } = await listBrandChannels(getTestPool(), brandId);

    expect(channels.map((channel) => [channel.code, channel.name, channel.isActive])).toEqual([
      ["pos", "POS", false],
      ["sok", "SOK", false],
      ["tqr", "TQR", false],
    ]);
  });

  it("switches a channel on and off for one brand only", async () => {
    const pool = getTestPool();
    const otherBrandId = await createOtherBrand();

    const on = await channelOf("tqr");
    expect(on).toMatchObject({ brandId, code: "tqr", isActive: true });
    const off = await updateBrandChannel(pool, brandId, on.channelId, { isActive: false });
    expect(off.isActive).toBe(false);
    await channelOf("pos");

    const mine = await listBrandChannels(pool, brandId);
    expect(mine.channels.filter((channel) => channel.isActive).map((channel) => channel.code)).toEqual(["pos"]);
    const theirs = await listBrandChannels(pool, otherBrandId);
    expect(theirs.channels.every((channel) => !channel.isActive)).toBe(true);
  });

  it("returns 404 for an unknown brand or channel", async () => {
    const pool = getTestPool();
    const tqr = await channelOf("tqr");

    await expect(listBrandChannels(pool, UNKNOWN_ID)).rejects.toThrow(NotFoundError);
    await expect(updateBrandChannel(pool, UNKNOWN_ID, tqr.channelId, { isActive: true })).rejects.toThrow(
      NotFoundError,
    );
    await expect(updateBrandChannel(pool, brandId, UNKNOWN_ID, { isActive: true })).rejects.toThrow(
      NotFoundError,
    );
  });

  it("creates a key for a known channel, even while it is switched off", async () => {
    const pool = getTestPool();
    const tqr = await channelOf("tqr", brandId, false);

    const created = await createKey(tqr.channelId);
    expect(created).toMatchObject({ channelId: tqr.channelId, channelCode: "tqr" });

    await expect(createKey(UNKNOWN_ID, "missing")).rejects.toThrow(ValidationError);
    await expect(
      createBrandApiKey(pool, { brandId: UNKNOWN_ID, name: "x", channelId: tqr.channelId, createdBy: "test" }),
    ).rejects.toThrow(NotFoundError);
  });

  it("resolves a channel code, as the CLI sends it", async () => {
    const pool = getTestPool();
    const tqr = await channelOf("tqr");

    const created = await createBrandApiKey(pool, { brandId, name: "by-code", channelCode: "tqr", createdBy: "test" });
    expect(created).toMatchObject({ channelId: tqr.channelId, channelCode: "tqr" });

    await expect(
      createBrandApiKey(pool, { brandId, name: "unknown-code", channelCode: "grab", createdBy: "test" }),
    ).rejects.toThrow(ValidationError);
  });

  it("serves a channel key, rejects a mismatched or switched-off channel, and reports usage per channel", async () => {
    const pool = getTestPool();
    const tqr = await channelOf("tqr");
    const pos = await channelOf("pos");
    const tqrKey = (await createKey(tqr.channelId, "tqr-key")).key;
    const posKey = (await createKey(pos.channelId, "pos-key")).key;

    expect((await recommend(tqrKey)).statusCode).toBe(200);
    expect((await recommend(tqrKey, { channel: "tqr" })).statusCode).toBe(200);
    const mismatch = await recommend(tqrKey, { channel: "pos" });
    expect(mismatch.statusCode).toBe(400);
    expect(mismatch.json()).toMatchObject({ error: "VALIDATION_ERROR" });

    // A fresh app: the switched-off state would otherwise wait for the key cache to expire.
    await updateBrandChannel(pool, brandId, pos.channelId, { isActive: false });
    const freshApp = buildApp();
    await freshApp.ready();
    const switchedOff = await freshApp.inject({
      method: "POST",
      url: "/v1/recommendations",
      headers: { "x-api-key": posKey },
      payload: { outletId, cart: [] },
    });
    await freshApp.close();
    expect(switchedOff.statusCode).toBe(400);

    await waitForUsageRows(4);
    const today = new Date().toISOString().slice(0, 10);
    const usage = await getBrandUsage(pool, brandId, { from: today, to: today, tz: "UTC" });

    expect(usage.channels).toEqual([
      {
        channelId: tqr.channelId,
        code: "tqr",
        name: "TQR",
        succeeded: 2,
        clientErrors: 1,
        serverErrors: 0,
      },
      {
        channelId: pos.channelId,
        code: "pos",
        name: "POS",
        succeeded: 0,
        clientErrors: 1,
        serverErrors: 0,
      },
    ]);
  });

  it("serves a key created before channels existed without any channel check", async () => {
    const pool = getTestPool();
    const legacy = await createKey((await channelOf("tqr")).channelId, "legacy");
    await pool.query("UPDATE brand_api_keys SET channel_id = NULL WHERE id = $1", [legacy.id]);

    expect((await recommend(legacy.key, { channel: "anything" })).statusCode).toBe(200);

    await waitForUsageRows(1);
    const today = new Date().toISOString().slice(0, 10);
    const usage = await getBrandUsage(pool, brandId, { from: today, to: today, tz: "UTC" });
    expect(usage.channels).toEqual([
      { channelId: null, code: null, name: null, succeeded: 1, clientErrors: 0, serverErrors: 0 },
    ]);
  });
});

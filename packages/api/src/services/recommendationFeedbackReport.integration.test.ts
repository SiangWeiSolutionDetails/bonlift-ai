import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { NotFoundError, ValidationError } from "../errors.js";
import { getTestPool } from "../testing/testDb.js";
import { createBrand } from "./brand.service.js";
import { createOutlet } from "./outlet.service.js";
import {
  getRecommendationFeedbackReport,
  listRecommendationServes,
} from "./recommendationFeedbackReport.service.js";
import { createTenant } from "./tenant.service.js";

const RANGE = { from: "2026-01-01", to: "2026-01-03", tz: "Asia/Singapore" };

let brandId: string;
let otherBrandId: string;
let outletId: string;
let secondOutletId: string;
let tqrChannelId: string;

interface StoredServe {
  servedAt: string;
  brand?: string;
  outlet?: string;
  channelId?: string | null;
  daypart?: string;
  itemIds?: string[];
  reasons?: string[];
  accepted?: string[];
  rejected?: string[];
}

// servedAt is SQL so tests can place serves relative to the database's now().
async function storeServe(serve: StoredServe): Promise<string> {
  const id = randomUUID();
  const itemIds = serve.itemIds ?? ["A"];
  await getTestPool().query(
    `
    INSERT INTO recommendation_serves (
      id, brand_id, channel_id, outlet_id, daypart, item_ids, reasons, accepted_item_ids,
      rejected_item_ids, served_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, ${serve.servedAt})
    `,
    [
      id,
      serve.brand ?? brandId,
      serve.channelId ?? null,
      serve.outlet ?? outletId,
      serve.daypart ?? "lunch",
      itemIds,
      serve.reasons ?? itemIds.map(() => "popular_at_outlet"),
      serve.accepted ?? [],
      serve.rejected ?? [],
    ],
  );
  return id;
}

function at(timestamp: string): string {
  return `'${timestamp}'::timestamptz`;
}

function utcDate(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function report(query: Partial<Parameters<typeof getRecommendationFeedbackReport>[2]> = {}, brand = brandId) {
  return getRecommendationFeedbackReport(getTestPool(), brand, { ...RANGE, ...query });
}

function serves(query: Partial<Parameters<typeof listRecommendationServes>[2]> = {}, brand = brandId) {
  return listRecommendationServes(getTestPool(), brand, { ...RANGE, ...query });
}

function counts(servedItems: number, accepted: number, rejected: number, ignored: number, awaiting: number) {
  const decided = accepted + rejected + ignored;
  return {
    servedItems,
    accepted,
    rejected,
    ignored,
    awaiting,
    acceptanceRate: decided === 0 ? null : accepted / decided,
  };
}

beforeEach(async () => {
  const pool = getTestPool();
  const tenant = await createTenant(pool, { name: "Acme Foods" });
  brandId = (await createBrand(pool, { tenantId: tenant.id, name: "Kopi House" })).id;
  otherBrandId = (await createBrand(pool, { tenantId: tenant.id, name: "Other House" })).id;
  outletId = (await createOutlet(pool, { brandId, name: "Boat Quay" })).id;
  secondOutletId = (await createOutlet(pool, { brandId, name: "Tampines" })).id;
  const channel = await pool.query("SELECT id FROM channels WHERE code = 'tqr'");
  tqrChannelId = channel.rows[0].id;
});

describe("getRecommendationFeedbackReport (integration)", () => {
  it("classifies items, accepted winning over rejected, and awaiting until 2 hours have passed", async () => {
    const recent = { from: utcDate(-1), to: utcDate(1), tz: "UTC" };
    await storeServe({
      servedAt: "now() - interval '2 hours 1 minute'",
      itemIds: ["A", "B", "C", "D"],
      accepted: ["A", "B"],
      rejected: ["B", "C"],
    });
    await storeServe({ servedAt: "now() - interval '1 hour 59 minutes'", itemIds: ["E", "F"], rejected: ["F"] });

    const result = await report(recent);

    // A accepted, B accepted (wins), C rejected, D ignored; E awaiting, F rejected.
    expect(result.summary).toStrictEqual({ ...counts(6, 2, 2, 1, 1), serves: 2 });
    expect(result.summary.acceptanceRate).toBe(0.4);
  });

  it("returns a null acceptance rate when every item is awaiting", async () => {
    await storeServe({ servedAt: "now()", itemIds: ["A", "B"] });

    const result = await report({ from: utcDate(-1), to: utcDate(1), tz: "UTC" });

    expect(result.summary).toStrictEqual({ ...counts(2, 0, 0, 0, 2), serves: 1 });
    expect(result.summary.acceptanceRate).toBeNull();
  });

  it("returns every day of the range in the time zone, zeros included", async () => {
    // 20:00 UTC on 1 Jan is 04:00 on 2 Jan in Singapore. The other two fall just outside the range there.
    await storeServe({ servedAt: at("2026-01-01T20:00:00Z"), itemIds: ["A", "B"], accepted: ["A"] });
    await storeServe({ servedAt: at("2025-12-31T15:59:59Z") });
    await storeServe({ servedAt: at("2026-01-03T16:00:00Z") });

    const result = await report();

    expect(result.days).toStrictEqual([
      { date: "2026-01-01", ...counts(0, 0, 0, 0, 0) },
      { date: "2026-01-02", ...counts(2, 1, 0, 1, 0) },
      { date: "2026-01-03", ...counts(0, 0, 0, 0, 0) },
    ]);
    expect(result.summary).toStrictEqual({ ...counts(2, 1, 0, 1, 0), serves: 1 });
  });

  it("returns an empty report for a brand without serves", async () => {
    const result = await report({ to: "2026-01-01" });

    expect(result).toStrictEqual({
      brandId,
      ...RANGE,
      to: "2026-01-01",
      summary: { ...counts(0, 0, 0, 0, 0), serves: 0 },
      days: [{ date: "2026-01-01", ...counts(0, 0, 0, 0, 0) }],
      byItem: [],
      byOutlet: [],
      byReason: [],
      byDaypart: [],
    });
  });

  it("breaks down by item, outlet (deleted outlets keep their name), reason and daypart", async () => {
    await storeServe({
      servedAt: at("2026-01-02T01:00:00Z"),
      itemIds: ["A", "B"],
      reasons: ["popular_at_outlet", "frequently_ordered"],
      accepted: ["A"],
    });
    await storeServe({
      servedAt: at("2026-01-02T02:00:00Z"),
      outlet: secondOutletId,
      daypart: "dinner",
      itemIds: ["A"],
      rejected: ["A"],
    });
    await getTestPool().query("UPDATE outlets SET deleted_at = now() WHERE id = $1", [secondOutletId]);

    const result = await report();

    expect(result.byItem).toStrictEqual([
      { key: "A", label: "A", ...counts(2, 1, 1, 0, 0) },
      { key: "B", label: "B", ...counts(1, 0, 0, 1, 0) },
    ]);
    expect(result.byOutlet).toStrictEqual([
      { key: outletId, label: "Boat Quay", ...counts(2, 1, 0, 1, 0) },
      { key: secondOutletId, label: "Tampines", ...counts(1, 0, 1, 0, 0) },
    ]);
    expect(result.byReason).toStrictEqual([
      { key: "popular_at_outlet", label: "popular_at_outlet", ...counts(2, 1, 1, 0, 0) },
      { key: "frequently_ordered", label: "frequently_ordered", ...counts(1, 0, 0, 1, 0) },
    ]);
    expect(result.byDaypart).toStrictEqual([
      { key: "lunch", label: "lunch", ...counts(2, 1, 0, 1, 0) },
      { key: "dinner", label: "dinner", ...counts(1, 0, 1, 0, 0) },
    ]);
  });

  it("sorts rows with the same served items by key", async () => {
    await storeServe({ servedAt: at("2026-01-02T01:00:00Z"), itemIds: ["B", "A"] });

    const result = await report();

    expect(result.byItem.map((row) => row.key)).toEqual(["A", "B"]);
  });

  it("leaves out other brands' serves", async () => {
    const otherOutlet = (await createOutlet(getTestPool(), { brandId: otherBrandId, name: "Elsewhere" })).id;
    await storeServe({ servedAt: at("2026-01-02T01:00:00Z"), brand: otherBrandId, outlet: otherOutlet });

    const result = await report();

    expect(result.summary.servedItems).toBe(0);
  });

  describe("filters", () => {
    beforeEach(async () => {
      await storeServe({
        servedAt: at("2026-01-02T01:00:00Z"),
        channelId: tqrChannelId,
        itemIds: ["A", "B"],
        reasons: ["popular_at_outlet", "frequently_ordered"],
      });
      await storeServe({
        servedAt: at("2026-01-02T02:00:00Z"),
        outlet: secondOutletId,
        daypart: "dinner",
        itemIds: ["C"],
      });
    });

    it("filters by outlet", async () => {
      const result = await report({ outletId: secondOutletId });

      expect(result.byItem.map((row) => row.key)).toEqual(["C"]);
      expect(result.summary.serves).toBe(1);
    });

    it("filters by daypart", async () => {
      const result = await report({ daypart: "dinner" });

      expect(result.byItem.map((row) => row.key)).toEqual(["C"]);
    });

    it("filters by channel", async () => {
      const result = await report({ channelId: tqrChannelId });

      expect(result.byItem.map((row) => row.key)).toEqual(["A", "B"]);
    });

    it("filters by each item's own reason", async () => {
      const result = await report({ reason: "frequently_ordered" });

      expect(result.byItem.map((row) => row.key)).toEqual(["B"]);
      expect(result.summary).toStrictEqual({ ...counts(1, 0, 0, 1, 0), serves: 1 });
      expect(result.byReason.map((row) => row.key)).toEqual(["frequently_ordered"]);
    });
  });

  it("throws NotFoundError for an unknown brand", async () => {
    await expect(report({}, randomUUID())).rejects.toThrow(NotFoundError);
  });

  it("throws NotFoundError for a deleted brand", async () => {
    await getTestPool().query("UPDATE brands SET deleted_at = now() WHERE id = $1", [brandId]);

    await expect(report()).rejects.toThrow(NotFoundError);
  });
});

describe("listRecommendationServes (integration)", () => {
  it("returns a serve with its outlet, channel and per-item outcomes in rank order", async () => {
    const id = await storeServe({
      servedAt: at("2026-01-02T01:00:00Z"),
      channelId: tqrChannelId,
      itemIds: ["A", "B", "C"],
      reasons: ["frequently_ordered", "popular_at_outlet", "popular_at_outlet"],
      accepted: ["A"],
      rejected: ["A", "B"],
    });

    expect(await serves()).toStrictEqual({
      serves: [
        {
          id,
          servedAt: "2026-01-02T01:00:00.000Z",
          outletId,
          outletName: "Boat Quay",
          channelCode: "tqr",
          daypart: "lunch",
          items: [
            { itemId: "A", label: "A", rank: 1, reason: "frequently_ordered", outcome: "accepted" },
            { itemId: "B", label: "B", rank: 2, reason: "popular_at_outlet", outcome: "rejected" },
            { itemId: "C", label: "C", rank: 3, reason: "popular_at_outlet", outcome: "ignored" },
          ],
        },
      ],
      nextCursor: null,
    });
  });

  it("marks an item awaiting while feedback can still arrive", async () => {
    await storeServe({ servedAt: "now() - interval '1 hour 59 minutes'" });

    const page = await serves({ from: utcDate(-1), to: utcDate(1), tz: "UTC" });

    expect(page.serves[0].items[0].outcome).toBe("awaiting");
    expect(page.serves[0].channelCode).toBeNull();
  });

  it("pages newest first with no overlap, down to microseconds and equal times", async () => {
    const ids = [
      await storeServe({ servedAt: at("2026-01-02T01:00:00.000001Z") }),
      await storeServe({ servedAt: at("2026-01-02T01:00:00.000002Z") }),
      await storeServe({ servedAt: at("2026-01-02T01:00:00.000003Z") }),
      await storeServe({ servedAt: at("2026-01-02T01:00:00.000003Z") }),
      await storeServe({ servedAt: at("2026-01-02T02:00:00Z") }),
    ];
    const tied = [ids[2], ids[3]].sort().reverse();
    const expected = [ids[4], ...tied, ids[1], ids[0]];

    const first = await serves({ limit: 3 });
    const second = await serves({ limit: 3, before: first.nextCursor as string });

    expect(first.serves.map((serve) => serve.id)).toEqual(expected.slice(0, 3));
    expect(first.nextCursor).not.toBeNull();
    expect(second.serves.map((serve) => serve.id)).toEqual(expected.slice(3));
    expect(second.nextCursor).toBeNull();
  });

  it("returns no cursor when the page is exactly full", async () => {
    await storeServe({ servedAt: at("2026-01-02T01:00:00Z") });
    await storeServe({ servedAt: at("2026-01-02T02:00:00Z") });

    expect((await serves({ limit: 2 })).nextCursor).toBeNull();
  });

  it("applies the filters, keeping a serve with any item of the reason and all its items", async () => {
    const kept = await storeServe({
      servedAt: at("2026-01-02T01:00:00Z"),
      channelId: tqrChannelId,
      itemIds: ["A", "B"],
      reasons: ["popular_at_outlet", "frequently_ordered"],
    });
    const dinner = await storeServe({
      servedAt: at("2026-01-02T02:00:00Z"),
      outlet: secondOutletId,
      daypart: "dinner",
    });

    expect((await serves({ reason: "frequently_ordered" })).serves.map((s) => [s.id, s.items.length])).toEqual([
      [kept, 2],
    ]);
    expect((await serves({ outletId: secondOutletId })).serves.map((s) => s.id)).toEqual([dinner]);
    expect((await serves({ daypart: "dinner" })).serves.map((s) => s.id)).toEqual([dinner]);
    expect((await serves({ channelId: tqrChannelId })).serves.map((s) => s.id)).toEqual([kept]);
  });

  it("returns an empty page for a brand without serves", async () => {
    expect(await serves()).toStrictEqual({ serves: [], nextCursor: null });
  });

  it("throws ValidationError for a cursor that is not one of ours", async () => {
    await expect(serves({ before: "not-a-cursor" })).rejects.toThrow(ValidationError);
  });

  it("throws NotFoundError for an unknown brand", async () => {
    await expect(serves({}, randomUUID())).rejects.toThrow(NotFoundError);
  });
});

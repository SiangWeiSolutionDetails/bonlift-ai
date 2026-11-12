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
  runId?: string | null;
  customerRunId?: string | null;
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
      id, brand_id, channel_id, outlet_id, daypart, run_id, customer_run_id, item_ids, reasons, accepted_item_ids,
      rejected_item_ids, served_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, ${serve.servedAt})
    `,
    [
      id,
      serve.brand ?? brandId,
      serve.channelId ?? null,
      serve.outlet ?? outletId,
      serve.daypart ?? "lunch",
      serve.runId ?? null,
      serve.customerRunId ?? null,
      itemIds,
      serve.reasons ?? itemIds.map(() => "popular_at_outlet"),
      serve.accepted ?? [],
      serve.rejected ?? [],
    ],
  );
  return id;
}

type ScoringJobType = "outlet_item_scores" | "customer_item_scores";

// Outlet scoring runs belong to an outlet, customer scoring runs to the brand.
async function storeRun(jobType: ScoringJobType, finishedAt: string): Promise<string> {
  const result = await getTestPool().query(
    `
    INSERT INTO computation_runs (
      brand_id, outlet_id, job_type, run_date, algorithm_version, calculation_config_version_id,
      input_window_from, input_window_to, trigger_type, status, row_count, started_at, finished_at
    )
    SELECT $1, $2, $3, current_date, 'test', v.id, '2026-01-01', '2026-01-01', 'manual', 'succeeded', 1,
           $4::timestamptz - interval '1 minute', $4
    FROM calculation_config_versions v
    WHERE v.brand_id = $1
      AND v.job_type = $3
    ORDER BY v.version DESC
    LIMIT 1
    RETURNING id
    `,
    [brandId, jobType === "outlet_item_scores" ? outletId : null, jobType, finishedAt],
  );
  return result.rows[0].id;
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

function counts(accepted: number, rejected: number) {
  return { accepted, rejected };
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
  it("counts the stored accepted and rejected items, accepted winning over rejected", async () => {
    await storeServe({
      servedAt: at("2026-01-02T01:00:00Z"),
      itemIds: ["A", "B", "C", "D"],
      accepted: ["A", "B"],
      rejected: ["B", "C"],
    });

    const result = await report();

    // A accepted, B accepted (wins), C rejected; D has no feedback and is not counted.
    expect(result.summary).toStrictEqual(counts(2, 1));
    expect(result.byItem.map((row) => row.key)).toEqual(["A", "B", "C"]);
  });

  it("counts nothing for serves without feedback", async () => {
    await storeServe({ servedAt: at("2026-01-02T01:00:00Z"), itemIds: ["A", "B"] });
    await storeServe({ servedAt: at("2026-01-02T02:00:00Z"), outlet: secondOutletId, itemIds: ["C"], accepted: ["C"] });

    const result = await report();

    expect(result.summary).toStrictEqual(counts(1, 0));
    expect(result.byItem.map((row) => row.key)).toEqual(["C"]);
    expect(result.byOutlet.map((row) => row.key)).toEqual([secondOutletId]);
  });

  it("returns every day of the range in the time zone, zeros included", async () => {
    // 20:00 UTC on 1 Jan is 04:00 on 2 Jan in Singapore. The other two fall just outside the range there.
    await storeServe({ servedAt: at("2026-01-01T20:00:00Z"), itemIds: ["A", "B"], accepted: ["A"], rejected: ["B"] });
    await storeServe({ servedAt: at("2025-12-31T15:59:59Z"), accepted: ["A"] });
    await storeServe({ servedAt: at("2026-01-03T16:00:00Z"), accepted: ["A"] });

    const result = await report();

    expect(result.days).toStrictEqual([
      { date: "2026-01-01", ...counts(0, 0) },
      { date: "2026-01-02", ...counts(1, 1) },
      { date: "2026-01-03", ...counts(0, 0) },
    ]);
    expect(result.summary).toStrictEqual(counts(1, 1));
  });

  it("returns an empty report for a brand without serves", async () => {
    const result = await report({ to: "2026-01-01" });

    expect(result).toStrictEqual({
      brandId,
      ...RANGE,
      to: "2026-01-01",
      summary: counts(0, 0),
      days: [{ date: "2026-01-01", ...counts(0, 0) }],
      byItem: [],
      byOutlet: [],
      byReason: [],
      byDaypart: [],
      byRun: [],
    });
  });

  it("breaks down by item, outlet (deleted outlets keep their name), reason and daypart", async () => {
    await storeServe({
      servedAt: at("2026-01-02T01:00:00Z"),
      itemIds: ["A", "B", "C"],
      reasons: ["popular_at_outlet", "frequently_ordered", "frequently_ordered"],
      accepted: ["A"],
      rejected: ["B"],
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

    // C has no feedback, so it has no row.
    expect(result.byItem).toStrictEqual([
      { key: "A", label: "A", ...counts(1, 1) },
      { key: "B", label: "B", ...counts(0, 1) },
    ]);
    expect(result.byOutlet).toStrictEqual([
      { key: outletId, label: "Boat Quay", ...counts(1, 1) },
      { key: secondOutletId, label: "Tampines", ...counts(0, 1) },
    ]);
    expect(result.byReason).toStrictEqual([
      { key: "popular_at_outlet", label: "popular_at_outlet", ...counts(1, 1) },
      { key: "frequently_ordered", label: "frequently_ordered", ...counts(0, 1) },
    ]);
    expect(result.byDaypart).toStrictEqual([
      { key: "lunch", label: "lunch", ...counts(1, 1) },
      { key: "dinner", label: "dinner", ...counts(0, 1) },
    ]);
  });

  it("sorts rows by feedback count, then accepted, then key", async () => {
    await storeServe({
      servedAt: at("2026-01-02T01:00:00Z"),
      itemIds: ["A", "B", "C", "D", "E"],
      accepted: ["E", "D"],
      rejected: ["B", "A", "C"],
    });
    await storeServe({ servedAt: at("2026-01-02T02:00:00Z"), itemIds: ["C"], rejected: ["C"] });

    const result = await report();

    // C has 2; then 1 each: accepted D and E before rejected A and B, each pair by key.
    expect(result.byItem.map((row) => row.key)).toEqual(["C", "D", "E", "A", "B"]);
  });

  describe("by run", () => {
    let outletRunId: string;
    let customerRunId: string;
    let missingRunId: string;

    beforeEach(async () => {
      outletRunId = await storeRun("outlet_item_scores", "2026-01-01T18:00:00Z");
      customerRunId = await storeRun("customer_item_scores", "2026-01-01T19:00:00Z");
      // Runs are deleted by retention while their serves stay; serves have no foreign key to runs.
      missingRunId = randomUUID();
      await storeServe({
        servedAt: at("2026-01-02T01:00:00Z"),
        runId: outletRunId,
        customerRunId,
        itemIds: ["A", "B", "C", "D"],
        reasons: ["popular_at_outlet", "frequently_ordered", "frequently_ordered", "goes_with_cart"],
        accepted: ["A", "B", "D"],
        rejected: ["C"],
      });
      await storeServe({
        servedAt: at("2026-01-02T02:00:00Z"),
        runId: missingRunId,
        customerRunId,
        itemIds: ["E", "F"],
        reasons: ["popular_at_outlet", "frequently_ordered"],
        accepted: ["E"],
        rejected: ["F"],
      });
    });

    it("attributes each item to its reason's run, sorted like the other breakdowns", async () => {
      const result = await report();
      const outletRun = {
        key: outletRunId,
        label: outletRunId,
        jobType: "outlet_item_scores",
        runAt: "2026-01-01T18:00:00.000Z",
        runAvailable: true,
        ...counts(1, 0),
      };
      const missingRun = {
        key: missingRunId,
        label: missingRunId,
        jobType: "outlet_item_scores",
        runAt: null,
        runAvailable: false,
        ...counts(1, 0),
      };
      // The two outlet runs tie on counts, so they are ordered by key.
      const tied = outletRunId < missingRunId ? [outletRun, missingRun] : [missingRun, outletRun];

      expect(result.byRun).toStrictEqual([
        {
          key: customerRunId,
          label: customerRunId,
          jobType: "customer_item_scores",
          runAt: "2026-01-01T19:00:00.000Z",
          runAvailable: true,
          ...counts(1, 2),
        },
        ...tied,
      ]);
    });

    it("leaves items of a reason without a run out of byRun only", async () => {
      const result = await report();

      expect(result.summary).toStrictEqual(counts(4, 2));
      expect(result.byItem.map((row) => row.key)).toContain("D");
      expect(result.byReason.map((row) => row.key)).toContain("goes_with_cart");
      const byRunTotal = result.byRun.reduce((sum, row) => sum + row.accepted + row.rejected, 0);
      expect(byRunTotal).toBe(5);
    });

    it("filters the report to the items from one run", async () => {
      const result = await report({ runId: customerRunId });

      expect(result.summary).toStrictEqual(counts(1, 2));
      expect(result.byItem.map((row) => row.key)).toEqual(["B", "C", "F"]);
      expect(result.byRun.map((row) => row.key)).toEqual([customerRunId]);
    });

    it("filters the report to a run that no longer exists", async () => {
      const result = await report({ runId: missingRunId });

      expect(result.summary).toStrictEqual(counts(1, 0));
      expect(result.byItem.map((row) => row.key)).toEqual(["E"]);
    });

    it("filters the report to an outlet run's popular_at_outlet items", async () => {
      const result = await report({ runId: outletRunId });

      expect(result.byItem.map((row) => row.key)).toEqual(["A"]);
    });
  });

  it("leaves out other brands' serves", async () => {
    const otherOutlet = (await createOutlet(getTestPool(), { brandId: otherBrandId, name: "Elsewhere" })).id;
    await storeServe({ servedAt: at("2026-01-02T01:00:00Z"), brand: otherBrandId, outlet: otherOutlet });

    const result = await report();

    expect(result.summary).toStrictEqual(counts(0, 0));
  });

  describe("filters", () => {
    beforeEach(async () => {
      await storeServe({
        servedAt: at("2026-01-02T01:00:00Z"),
        channelId: tqrChannelId,
        itemIds: ["A", "B", "D"],
        reasons: ["popular_at_outlet", "frequently_ordered", "frequently_ordered"],
        accepted: ["A"],
        rejected: ["B"],
      });
      await storeServe({
        servedAt: at("2026-01-02T02:00:00Z"),
        outlet: secondOutletId,
        daypart: "dinner",
        itemIds: ["C"],
        accepted: ["C"],
      });
    });

    it("filters by outlet", async () => {
      const result = await report({ outletId: secondOutletId });

      expect(result.byItem.map((row) => row.key)).toEqual(["C"]);
      expect(result.summary).toStrictEqual(counts(1, 0));
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

      // D shares the reason but has no feedback; A is accepted but has another reason.
      expect(result.byItem.map((row) => row.key)).toEqual(["B"]);
      expect(result.summary).toStrictEqual(counts(0, 1));
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
  it("returns a serve with its outlet, channel and per-item feedback in rank order", async () => {
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
            { itemId: "C", label: "C", rank: 3, reason: "popular_at_outlet", outcome: null },
          ],
        },
      ],
      nextCursor: null,
    });
  });

  it("returns a null outcome for an item without feedback, however recent", async () => {
    await storeServe({ servedAt: "now()" });

    const page = await serves({ from: utcDate(-1), to: utcDate(1), tz: "UTC" });

    expect(page.serves[0].items[0].outcome).toBeNull();
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

  it("filters by run, keeping a serve with any item from that run and all its items", async () => {
    const runId = randomUUID();
    const kept = await storeServe({
      servedAt: at("2026-01-02T01:00:00Z"),
      customerRunId: runId,
      itemIds: ["A", "B"],
      reasons: ["popular_at_outlet", "frequently_ordered"],
    });
    // The run is the serve's customer run, but no item has the reason it feeds.
    await storeServe({
      servedAt: at("2026-01-02T02:00:00Z"),
      customerRunId: runId,
      itemIds: ["C"],
      reasons: ["popular_at_outlet"],
    });
    const byOutletRun = await storeServe({ servedAt: at("2026-01-02T03:00:00Z"), runId, itemIds: ["D"] });

    expect((await serves({ runId })).serves.map((s) => [s.id, s.items.length])).toEqual([
      [byOutletRun, 1],
      [kept, 2],
    ]);
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

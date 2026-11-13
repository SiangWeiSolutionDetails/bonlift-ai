import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { NotFoundError } from "../errors.js";
import { getTestPool } from "../testing/testDb.js";
import { createBrand, deleteBrand } from "./brand.service.js";
import { getCalculationsOverview } from "./calculationsOverview.service.js";
import { createOutlet } from "./outlet.service.js";
import { createTenant } from "./tenant.service.js";

type JobType = "outlet_item_scores" | "customer_item_scores" | "item_affinity";

async function createTestBrand(): Promise<string> {
  const pool = getTestPool();
  const tenant = await createTenant(pool, { name: "Acme Foods" });
  return (await createBrand(pool, { tenantId: tenant.id, name: "Kopi House" })).id;
}

async function createTestOutlet(brandId: string, name: string): Promise<string> {
  return (await createOutlet(getTestPool(), { brandId, name })).id;
}

// Relative to yesterday in the default schedule zone, worked out by Postgres the same way the overview does.
async function daysBeforeWindowTo(days: number): Promise<string> {
  const result = await getTestPool().query(
    `SELECT ((now() AT TIME ZONE 'Asia/Singapore')::date - 1 - $1::int)::text AS day`,
    [days],
  );
  return result.rows[0].day;
}

async function insertRun(options: {
  brandId: string;
  outletId?: string;
  jobType: JobType;
  status: "running" | "succeeded" | "failed";
  to: string;
  startedAgo: string;
}): Promise<string> {
  const result = await getTestPool().query(
    `
    INSERT INTO computation_runs (
      brand_id, outlet_id, job_type, run_date, algorithm_version, calculation_config_version_id,
      input_window_from, input_window_to, trigger_type, triggered_by, status, row_count, started_at
    )
    SELECT $1, $2, $3, current_date, 'test', v.id, $5::date - 6, $5::date, 'manual', 'test', $4,
           CASE WHEN $4 = 'succeeded' THEN 1 END, now() - $6::interval
    FROM calculation_config_versions v
    WHERE v.brand_id = $1
      AND v.job_type = $3
    ORDER BY v.version DESC
    LIMIT 1
    RETURNING id;
    `,
    [options.brandId, options.outletId ?? null, options.jobType, options.status, options.to, options.startedAgo],
  );
  return result.rows[0].id;
}

async function publish(runId: string, outletId?: string) {
  const pool = getTestPool();
  if (outletId) {
    await pool.query(
      `INSERT INTO published_runs (outlet_id, job_type, run_id) VALUES ($1, 'outlet_item_scores', $2)`,
      [outletId, runId],
    );
    return;
  }
  await pool.query(
    `INSERT INTO brand_published_runs (brand_id, job_type, run_id) SELECT brand_id, job_type, id FROM computation_runs WHERE id = $1`,
    [runId],
  );
}

async function storeOutletScores(
  brandId: string,
  outletId: string,
  runId: string,
  rows: [daypart: string, itemId: string, nOrders: number][],
) {
  for (const [index, [daypart, itemId, nOrders]] of rows.entries()) {
    await getTestPool().query(
      `
      INSERT INTO outlet_item_scores (run_id, run_date, brand_id, outlet_id, external_item_id, daypart, score, n_orders, rank)
      VALUES ($1, current_date, $2, $3, $4, $5, 0.5, $6, $7);
      `,
      [runId, brandId, outletId, itemId, daypart, nOrders, index + 1],
    );
  }
}

async function storeSnapshot(outletId: string, orderDate: string, itemId: string, itemName: string) {
  const orders = [{ orderId: "O1", orderedAt: `${orderDate}T12:00:00+08:00`, customerId: "", lines: [{ itemId, itemName, qty: 1, unitPrice: 5 }] }];
  await getTestPool().query(
    `INSERT INTO order_snapshots (outlet_id, order_date, orders, order_count) VALUES ($1, $2::date, $3::jsonb, 1)`,
    [outletId, orderDate, JSON.stringify(orders)],
  );
}

describe("calculationsOverview.service (integration)", () => {
  it("summarises every calculation's runs, freshness, metrics and top lists for the brand's live outlets", async () => {
    const pool = getTestPool();
    const brandId = await createTestBrand();
    await pool.query(`UPDATE brand_calculation_schedules SET outlet_window_days = 7 WHERE brand_id = $1`, [brandId]);
    const busy = await createTestOutlet(brandId, "B Outlet");
    const idle = await createTestOutlet(brandId, "A Outlet");
    const gone = await createTestOutlet(brandId, "C Outlet");
    await pool.query(`UPDATE outlets SET deleted_at = now() WHERE id = $1`, [gone]);
    const windowTo = await daysBeforeWindowTo(0);

    // busy: orders in its window, published 2 days behind, then a newer failed run
    await storeSnapshot(busy, windowTo, "TEA", "Teh Tarik");
    const busyPublished = await insertRun({ brandId, outletId: busy, jobType: "outlet_item_scores", status: "succeeded", to: await daysBeforeWindowTo(2), startedAgo: "3 days" });
    await publish(busyPublished, busy);
    await storeOutletScores(brandId, busy, busyPublished, [["all_day", "RICE", 4], ["all_day", "TEA", 2], ["breakfast", "RICE", 3]]);
    await insertRun({ brandId, outletId: busy, jobType: "outlet_item_scores", status: "failed", to: windowTo, startedAgo: "1 hour" });
    // idle: no orders in its window, published 5 days behind, one run still running
    const idlePublished = await insertRun({ brandId, outletId: idle, jobType: "outlet_item_scores", status: "succeeded", to: await daysBeforeWindowTo(5), startedAgo: "6 days" });
    await publish(idlePublished, idle);
    await storeOutletScores(brandId, idle, idlePublished, [["all_day", "RICE", 1]]);
    await insertRun({ brandId, outletId: idle, jobType: "outlet_item_scores", status: "running", to: windowTo, startedAgo: "1 minute" });
    // A failed run older than 7 days is not counted
    await insertRun({ brandId, outletId: idle, jobType: "outlet_item_scores", status: "failed", to: windowTo, startedAgo: "8 days" });

    const customerRun = await insertRun({ brandId, jobType: "customer_item_scores", status: "succeeded", to: windowTo, startedAgo: "2 hours" });
    await publish(customerRun);
    await pool.query(
      `
      INSERT INTO customer_item_scores (run_id, run_date, brand_id, customer_external_id, daypart, external_item_id, score, n_orders, rank)
      VALUES ($1, current_date, $2, 'C1', 'all_day', 'RICE', 1, 2, 1),
             ($1, current_date, $2, 'C1', 'all_day', 'TEA', 0.5, 1, 2),
             ($1, current_date, $2, 'C2', 'all_day', 'RICE', 1, 1, 1);
      `,
      [customerRun, brandId],
    );

    const affinityRun = await insertRun({ brandId, jobType: "item_affinity", status: "succeeded", to: await daysBeforeWindowTo(1), startedAgo: "1 day" });
    await publish(affinityRun);
    await pool.query(
      `
      INSERT INTO item_affinity_scores (run_id, run_date, brand_id, item_a, item_a_name, item_b, item_b_name, n_pair, n_item_a, confidence, lift, rank)
      VALUES ($1, current_date, $2, 'RICE', 'Nasi Lemak', 'TEA', 'Teh Tarik', 2, 4, 0.5, 2, 1),
             ($1, current_date, $2, 'TEA', 'Teh Tarik', 'RICE', 'Nasi Lemak', 2, 3, 0.8, 2, 1);
      `,
      [affinityRun, brandId],
    );

    const overview = await getCalculationsOverview(pool, brandId);

    expect(overview).toMatchObject({ brandId, timeZone: "Asia/Singapore", windowTo });
    const [outletEntry, customerEntry, affinityEntry] = overview.calculations;
    expect(overview.calculations.map((entry) => [entry.jobType, entry.scope, entry.windowDays])).toEqual([
      ["outlet_item_scores", "outlet", 7],
      ["customer_item_scores", "brand", 90],
      ["item_affinity", "brand", 90],
    ]);

    expect(outletEntry).toMatchObject({
      latestRun: null,
      publishedRun: null,
      runningRuns: 1,
      failedRunsLast7Days: 1,
      resultsAgeDays: 5,
      metrics: { subjects: 2, rows: 4 },
    });
    expect(outletEntry.outlets.map((o) => [o.outletName, o.hasOrdersInWindow, o.latestRun?.status, o.publishedRun?.id])).toEqual([
      ["A Outlet", false, "running", idlePublished],
      ["B Outlet", true, "failed", busyPublished],
    ]);
    expect(outletEntry.outlets[1].publishedRun).toMatchObject({
      status: "succeeded",
      triggerType: "manual",
      to: await daysBeforeWindowTo(2),
      rowCount: 1,
      finishedAt: null,
    });
    expect(outletEntry.outlets[1].publishedRun?.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

    expect(customerEntry).toMatchObject({
      outlets: [],
      latestRun: { id: customerRun },
      publishedRun: { id: customerRun },
      runningRuns: 0,
      failedRunsLast7Days: 0,
      resultsAgeDays: 0,
      metrics: { subjects: 2, rows: 3 },
    });
    expect(affinityEntry).toMatchObject({ resultsAgeDays: 1, metrics: { subjects: 2, rows: 2 } });

    expect(overview.topPairs).toEqual([
      { itemA: "TEA", itemAName: "Teh Tarik", itemB: "RICE", itemBName: "Nasi Lemak", confidence: 0.8, lift: 2, nPair: 2 },
      { itemA: "RICE", itemAName: "Nasi Lemak", itemB: "TEA", itemBName: "Teh Tarik", confidence: 0.5, lift: 2, nPair: 2 },
    ]);
    // all_day only: RICE's breakfast orders are already in its all_day count
    expect(overview.topItems).toEqual([
      { itemId: "RICE", itemName: "Nasi Lemak", nOrders: 5, outlets: 2 },
      { itemId: "TEA", itemName: "Teh Tarik", nOrders: 2, outlets: 1 },
    ]);
  });

  it("returns empty state for a brand with nothing calculated", async () => {
    const pool = getTestPool();
    const brandId = await createTestBrand();
    const outletId = await createTestOutlet(brandId, "Only Outlet");

    const overview = await getCalculationsOverview(pool, brandId);

    expect(overview.topPairs).toEqual([]);
    expect(overview.topItems).toEqual([]);
    for (const entry of overview.calculations) {
      expect(entry).toMatchObject({ runningRuns: 0, failedRunsLast7Days: 0, resultsAgeDays: null, metrics: { subjects: 0, rows: 0 } });
    }
    expect(overview.calculations[0].outlets).toEqual([
      { outletId, outletName: "Only Outlet", isActive: true, hasOrdersInWindow: false, latestRun: null, publishedRun: null },
    ]);
  });

  it("falls back to the outlet's snapshot for an item name the affinity run does not have", async () => {
    const pool = getTestPool();
    const brandId = await createTestBrand();
    const outletId = await createTestOutlet(brandId, "Outlet");
    const windowTo = await daysBeforeWindowTo(0);
    await storeSnapshot(outletId, windowTo, "KAYA", "Kaya Toast");
    const runId = await insertRun({ brandId, outletId, jobType: "outlet_item_scores", status: "succeeded", to: windowTo, startedAgo: "1 hour" });
    await publish(runId, outletId);
    await storeOutletScores(brandId, outletId, runId, [["all_day", "KAYA", 3]]);

    expect((await getCalculationsOverview(pool, brandId)).topItems).toEqual([
      { itemId: "KAYA", itemName: "Kaya Toast", nOrders: 3, outlets: 1 },
    ]);
  });

  it("throws NotFoundError for an unknown or deleted brand", async () => {
    const pool = getTestPool();
    const deleted = await createTestBrand();
    await deleteBrand(pool, deleted);

    await expect(getCalculationsOverview(pool, randomUUID())).rejects.toThrow(NotFoundError);
    await expect(getCalculationsOverview(pool, deleted)).rejects.toThrow(NotFoundError);
  });
});

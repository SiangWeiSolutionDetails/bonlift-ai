import { CalculationJobTypeSchemaType } from "@bonlift-ai/contracts";
import { Pool } from "pg";

// Raw SQL fixtures for worker integration tests. The worker has no service layer to reuse, and importing the API's
// services would cross package boundaries, so these insert the minimum rows each calculation reads.

export interface DaypartFixture {
  name: string;
  start: string;
  end: string;
}

export interface OrderLineFixture {
  itemId: string;
  qty?: number;
  unitPrice?: number;
  addons?: string[];
  modifiers?: string[];
}

export interface OrderFixture {
  orderId: string;
  orderedAt: string;
  customerId?: string;
  lines: OrderLineFixture[];
}

let nameCounter = 0;

function uniqueName(prefix: string): string {
  nameCounter += 1;
  return `${prefix} ${nameCounter}`;
}

// Same rows createBrand inserts: the brand, its channel mapping (all off), version 1 of each calculation config, and its
// default schedule.
export async function createBrandFixture(
  pool: Pool,
  options: { isActive?: boolean; deleted?: boolean; dayparts?: DaypartFixture[] } = {},
): Promise<string> {
  const result = await pool.query(
    `
    WITH
    t AS (
      INSERT INTO tenants (name) VALUES ($1) RETURNING id
    ),
    b AS (
      INSERT INTO brands (tenant_id, name, is_active, deleted_at)
      SELECT t.id, $2, $3, CASE WHEN $4 THEN now() END FROM t
      RETURNING id
    ),
    bch AS (
      INSERT INTO brand_channels (brand_id, channel_id)
      SELECT b.id, c.id FROM b CROSS JOIN channels c
    ),
    ccv AS (
      INSERT INTO calculation_config_versions (brand_id, job_type)
      SELECT b.id, j.job_type
      FROM b
      CROSS JOIN (VALUES ('outlet_item_scores'), ('customer_item_scores'), ('item_affinity')) AS j(job_type)
      RETURNING id, job_type
    ),
    oisccv AS (
      INSERT INTO outlet_item_scores_calculation_config_versions (id, dayparts)
      SELECT id, $5::jsonb FROM ccv WHERE job_type = 'outlet_item_scores'
    ),
    cisccv AS (
      INSERT INTO customer_item_scores_calculation_config_versions (id)
      SELECT id FROM ccv WHERE job_type = 'customer_item_scores'
    ),
    iaccv AS (
      INSERT INTO item_affinity_calculation_config_versions (id)
      SELECT id FROM ccv WHERE job_type = 'item_affinity'
    ),
    bcs AS (
      INSERT INTO brand_calculation_schedules (brand_id)
      SELECT id FROM b
    )
    SELECT id FROM b;
    `,
    [
      uniqueName("Tenant"),
      uniqueName("Brand"),
      options.isActive ?? true,
      options.deleted ?? false,
      JSON.stringify(options.dayparts ?? []),
    ],
  );
  return result.rows[0].id;
}

async function nextConfigVersion(
  pool: Pool,
  brandId: string,
  jobType: CalculationJobTypeSchemaType,
): Promise<string> {
  const result = await pool.query(
    `
    INSERT INTO calculation_config_versions (brand_id, job_type, version)
    SELECT $1, $2, max(version) + 1
    FROM calculation_config_versions
    WHERE brand_id = $1
      AND job_type = $2
    RETURNING id;
    `,
    [brandId, jobType],
  );
  return result.rows[0].id;
}

export async function addOutletConfigVersion(
  pool: Pool,
  brandId: string,
  dayparts: DaypartFixture[],
): Promise<void> {
  const id = await nextConfigVersion(pool, brandId, "outlet_item_scores");
  await pool.query(
    `INSERT INTO outlet_item_scores_calculation_config_versions (id, dayparts) VALUES ($1, $2::jsonb)`,
    [id, JSON.stringify(dayparts)],
  );
}

// NULL is a version from before the limit existed: every order in the window is scored.
export async function addCustomerConfigVersion(
  pool: Pool,
  brandId: string,
  maxRecentOrders: number | null,
): Promise<void> {
  const id = await nextConfigVersion(pool, brandId, "customer_item_scores");
  await pool.query(
    `INSERT INTO customer_item_scores_calculation_config_versions (id, max_recent_orders) VALUES ($1, $2)`,
    [id, maxRecentOrders],
  );
}

export async function createOutletFixture(
  pool: Pool,
  brandId: string,
  options: { isActive?: boolean } = {},
): Promise<string> {
  const result = await pool.query(
    `
    INSERT INTO outlets (tenant_id, brand_id, name, is_active)
    SELECT b.tenant_id, b.id, $2, $3
    FROM brands b
    WHERE b.id = $1
    RETURNING id;
    `,
    [brandId, uniqueName("Outlet"), options.isActive ?? true],
  );
  return result.rows[0].id;
}

export function order(
  orderId: string,
  orderedAt: string,
  itemIds: string[],
  customerId?: string,
): OrderFixture {
  return {
    orderId,
    orderedAt,
    customerId,
    lines: itemIds.map((itemId) => ({ itemId })),
  };
}

function childItem(itemId: string) {
  return { itemId, itemName: itemId, qty: 1, unitPrice: 1 };
}

export async function storeOrders(
  pool: Pool,
  outletId: string,
  orderDate: string,
  orders: OrderFixture[],
): Promise<void> {
  const payload = orders.map((o) => ({
    orderId: o.orderId,
    orderedAt: o.orderedAt,
    customerId: o.customerId ?? "",
    lines: o.lines.map((line) => ({
      itemId: line.itemId,
      itemName: line.itemId,
      qty: line.qty ?? 1,
      unitPrice: line.unitPrice ?? 5,
      ...(line.addons && { addons: line.addons.map(childItem) }),
      ...(line.modifiers && { modifiers: line.modifiers.map(childItem) }),
    })),
  }));

  await pool.query(
    `
    INSERT INTO order_snapshots (outlet_id, order_date, orders, order_count)
    VALUES ($1, $2::date, $3::jsonb, $4)
    ON CONFLICT (outlet_id, order_date) DO UPDATE
    SET orders = EXCLUDED.orders,
        order_count = EXCLUDED.order_count;
    `,
    [outletId, orderDate, JSON.stringify(payload), payload.length],
  );
}

// A running run on the latest config version, as the API's start endpoints create it.
export async function createRunFixture(
  pool: Pool,
  options: {
    brandId: string;
    outletId?: string;
    jobType: CalculationJobTypeSchemaType;
    from: string;
    to: string;
  },
): Promise<string> {
  const result = await pool.query(
    `
    INSERT INTO computation_runs (
      brand_id, outlet_id, job_type, run_date, algorithm_version, calculation_config_version_id,
      input_window_from, input_window_to, trigger_type, triggered_by, status
    )
    SELECT $1, $2, $3, current_date, 'test', v.id, $4::date, $5::date, 'manual', 'test', 'running'
    FROM calculation_config_versions v
    WHERE v.brand_id = $1
      AND v.job_type = $3
    ORDER BY v.version DESC
    LIMIT 1
    RETURNING id;
    `,
    [options.brandId, options.outletId ?? null, options.jobType, options.from, options.to],
  );
  return result.rows[0].id;
}

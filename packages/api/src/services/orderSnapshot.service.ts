import {
    DatasetDaySchemaType,
  DatasetResultSchemaType,
  DatasetSchema,
  DatasetSchemaType,
  OrderSnapshotCoverageSchemaType,
  OrderSnapshotDaySchemaType,
  OrderSnapshotParamsSchema,
  OutletParamsSchema,
} from "@ai-services/contracts";
import { Pool } from "pg";
import { NotFoundError, ValidationError } from "../errors.js";
import { assertValid, assertValidDate } from "../utils/validate.js";
import Value from "typebox/value";

function assertValidDays(days: DatasetDaySchemaType[]) {
  const seenDates = new Set<string>();

  for (const day of days) {
    assertValidDate(day.date, "YYYYMMDD");

    if (seenDates.has(day.date)) {
      throw new ValidationError(`${day.date} appears more than once.`);
    }
    seenDates.add(day.date);

    for (const order of day.orders) {
      // The date as written in the timestamp ("2026-06-26T..." → "20260626"); no time zone conversion.
      const orderDate = order.orderedAt.slice(0, 10).replaceAll("-", "");
      if (orderDate !== day.date) {
        throw new ValidationError(
          `${day.date}: order ${order.orderId} was placed on ${orderDate}.`,
        );
      }
    }
  }
}

export async function storeOrderSnapshots(
  pool: Pool,
  outletId: string,
  data: DatasetSchemaType,
): Promise<DatasetResultSchemaType> {
  assertValid(OutletParamsSchema, { outletId });

  const dataset = Value.Clean(DatasetSchema, data);
  assertValid(DatasetSchema, dataset);
  assertValidDays(dataset.dates);

  const result = await pool.query(
    `
    WITH
    outlet AS (
        SELECT 
            o.id,
            (o.is_active AND b.is_active) AS is_active
        FROM outlets o
        JOIN brands b
        ON b.id = o.brand_id
        WHERE o.id = $1
        AND o.deleted_at IS NULL
    ),
    saved AS (
        INSERT INTO order_snapshots (outlet_id, order_date, orders, order_count)
        SELECT
            o.id,
            d.date,
            d.orders,
            jsonb_array_length(d.orders)
        FROM outlet o, jsonb_to_recordset($2::jsonb) AS d(date date, orders jsonb)
        WHERE o.is_active IS TRUE
        ON CONFLICT (outlet_id, order_date) DO UPDATE
        SET orders = EXCLUDED.orders, order_count = EXCLUDED.order_count, updated_at = now()
        RETURNING
            order_date,
            order_count,
            CASE WHEN xmax = 0
                THEN 'inserted'
            ELSE 
                'replaced'
            END AS status
    )
    SELECT 
        o.is_active,
        to_char(s.order_date,'YYYYMMDD') AS date,
        s.order_count,
        s.status
    FROM outlet o
    LEFT JOIN saved s ON TRUE
    ORDER BY s.order_date;
    `,
    [outletId, JSON.stringify(dataset.dates)],
  );

  if (result.rows.length === 0) {
    throw new NotFoundError("Outlet does not exist.");
  }

  if (!result.rows[0].is_active) {
    throw new ValidationError("Outlet is inactive.");
  }

  return {
    outletId,
    dates: result.rows.map((row) => ({
      date: row.date,
      orderCount: row.order_count,
      status: row.status,
    })),
  };
}

function mapDayRow(row: any): OrderSnapshotDaySchemaType {
  return {
    date: row.date,
    isStored: row.is_stored,
    orderCount: row.order_count,
    sizeBytes: row.size_bytes,
    updatedAt: row.updated_at?.toISOString() ?? null,
    isStale: row.is_stale,
  };
}

function mapPublishedRun(row: any) {
  if (!row.published_run_id) return null;

  return {
    id: row.published_run_id,
    from: row.published_from,
    to: row.published_to,
    startedAt: row.published_started_at.toISOString(),
  };
}

export async function getOrderSnapshotCoverage(
  pool: Pool,
  outletId: string,
): Promise<OrderSnapshotCoverageSchemaType> {
  assertValid(OutletParamsSchema, { outletId });

  // Days span the outlet's first to last stored date, so gaps show up as rows without a snapshot.
  // pg_column_size reads the stored (compressed) size without decompressing the orders jsonb.
  // Stale: re-uploaded after the published run started, for a date inside that run's window.
  const result = await pool.query(
    `
    WITH
    outlet AS (
        SELECT id FROM outlets WHERE id = $1 AND deleted_at IS NULL
    ),
    bounds AS (
        SELECT min(order_date) AS first_date, max(order_date) AS last_date
        FROM order_snapshots
        WHERE outlet_id = $1
    ),
    published AS (
        SELECT r.id, r.input_window_from, r.input_window_to, r.started_at
        FROM published_runs p
        JOIN computation_runs r
        ON r.id = p.run_id
        WHERE p.outlet_id = $1
        AND p.job_type = 'outlet_item_scores'
    ),
    days AS (
        SELECT d::date AS order_date
        FROM bounds b, generate_series(b.first_date, b.last_date, interval '1 day') AS d
    )
    SELECT
        d.order_date::text AS date,
        os.outlet_id IS NOT NULL AS is_stored,
        os.order_count,
        pg_column_size(os.orders) AS size_bytes,
        os.updated_at,
        COALESCE(
            d.order_date >= pr.input_window_from
            AND d.order_date <= pr.input_window_to
            AND os.updated_at > pr.started_at,
            FALSE
        ) AS is_stale,
        pr.id AS published_run_id,
        pr.input_window_from::text AS published_from,
        pr.input_window_to::text AS published_to,
        pr.started_at AS published_started_at
    FROM outlet o
    LEFT JOIN days d ON TRUE
    LEFT JOIN order_snapshots os
    ON os.outlet_id = o.id
    AND os.order_date = d.order_date
    LEFT JOIN published pr ON TRUE
    ORDER BY d.order_date DESC;
    `,
    [outletId],
  );

  if (result.rows.length === 0) {
    throw new NotFoundError("Outlet does not exist.");
  }

  return {
    outletId,
    publishedRun: mapPublishedRun(result.rows[0]),
    days: result.rows.filter((row) => row.date !== null).map(mapDayRow),
  };
}

// Returned in the upload format, so a copied snapshot can be re-uploaded as is.
export async function getOrderSnapshot(
  pool: Pool,
  outletId: string,
  date: string,
): Promise<DatasetSchemaType> {
  assertValid(OrderSnapshotParamsSchema, { outletId, date });
  assertValidDate(date, "YYYY-MM-DD");

  // The outlet row tells "unknown outlet" (no row) apart from "no snapshot that day" (NULL orders).
  const result = await pool.query(
    `
    SELECT
        o.name AS outlet_name,
        to_char(os.order_date, 'YYYYMMDD') AS date,
        os.orders
    FROM outlets o
    LEFT JOIN order_snapshots os
    ON os.outlet_id = o.id
    AND os.order_date = $2::date
    WHERE o.id = $1
    AND o.deleted_at IS NULL;
    `,
    [outletId, date],
  );

  if (result.rows.length === 0) {
    throw new NotFoundError("Outlet does not exist.");
  }

  const row = result.rows[0];
  if (row.orders === null) {
    throw new NotFoundError("No snapshot is stored for this date.");
  }

  return {
    outletName: row.outlet_name,
    dates: [{ date: row.date, orders: row.orders }],
  };
}

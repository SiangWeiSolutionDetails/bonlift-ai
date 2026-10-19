import {
    DatasetDaySchemaType,
  DatasetResultSchemaType,
  DatasetSchema,
  DatasetSchemaType,
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
    ),
    saved AS (
        INSERT INTO order_snapshots (outlet_id, order_date, orders)
        SELECT 
            o.id, 
            d.date, 
            d.orders
        FROM outlet o, jsonb_to_recordset($2::jsonb) AS d(date date, orders jsonb)
        WHERE o.is_active IS TRUE 
        ON CONFLICT (outlet_id, order_date) DO UPDATE 
        SET orders = EXCLUDED.orders, updated_at = now()
        RETURNING 
            order_date,
            jsonb_array_length(orders) AS order_count, 
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

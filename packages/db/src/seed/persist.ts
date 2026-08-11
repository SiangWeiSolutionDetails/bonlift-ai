import { Pool } from "pg";
import { type GeneratedDataset } from "./types.js";

export async function persistDataset(
  pool: Pool,
  dataset: GeneratedDataset,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "TRUNCATE TABLE brands, outlets, customers, orders, order_lines CASCADE",
    );
    // Each table below is inserted via a single unchunked multi-row INSERT — fine at
    // this dev-scale config, but Postgres has a hard limit of 65,535 parameters per
    // query. Scaling run.ts's config toward the real target (tens of millions of
    // rows) will hit that wall. Deliberately deferred: real chunking (e.g. batches
    // of ~1,000 rows) or a COPY-based bulk load would need to replace this before
    // seeding at production-representative scale.

    const { brands, outlets, customers, orders } = dataset;

    // brands

    let placeholders: string[] = [];
    let values: unknown[] = [];

    brands.forEach((brand, i) => {
      const offset = i * 1;
      placeholders.push(`($${offset + 1})`);
      values.push(brand.name);
    });

    let result = await client.query(
      `INSERT INTO brands (name) VALUES ${placeholders.join(",")} RETURNING id`,
      values,
    );

    const brandIdMap: Map<string, string> = new Map<string, string>();

    result.rows.forEach((row, i) => {
      brandIdMap.set(brands[i].id, row.id);
    });

    // outlets

    placeholders = [];
    values = [];

    outlets.forEach((outlet, i) => {
      const offset = i * 2;
      placeholders.push(`($${offset + 1},$${offset + 2})`);
      const brandId = brandIdMap.get(outlet.brandId);
      values.push(outlet.name, brandId);
    });

    result = await client.query(
      `INSERT INTO outlets (name,brand_id) VALUES ${placeholders.join(",")} RETURNING id`,
      values,
    );

    const outletIdMap: Map<string, string> = new Map<string, string>();

    result.rows.forEach((row, i) => {
      outletIdMap.set(outlets[i].id, row.id);
    });

    // customers

    placeholders = [];
    values = [];

    customers.forEach((customer, i) => {
      placeholders.push(`(DEFAULT)`);
    });

    result = await client.query(
      `INSERT INTO customers (id) VALUES ${placeholders.join(",")} RETURNING id`,
    );

    const customerIdMap: Map<string, string> = new Map<string, string>();

    result.rows.forEach((row, i) => {
      customerIdMap.set(customers[i].id, row.id);
    });

    // orders

    placeholders = [];
    values = [];

    orders.forEach((order, i) => {
      const offset = i * 3;
      placeholders.push(`($${offset + 1},$${offset + 2},$${offset + 3})`);
      const outletId = outletIdMap.get(order.outletId);
      const customerId = order.customerId
        ? customerIdMap.get(order.customerId)
        : null;
      values.push(outletId, customerId, order.orderedAt);
    });

    result = await client.query(
      `INSERT INTO orders (outlet_id,customer_id,ordered_at) VALUES ${placeholders.join(",")} RETURNING id`,
      values,
    );

    const orderIdMap: Map<string, string> = new Map<string, string>();

    result.rows.forEach((row, i) => {
      orderIdMap.set(orders[i].id, row.id);
    });

    // order_lines

    placeholders = [];
    values = [];

    orders
      .flatMap((order, i) =>
        order.lines.map((line) => ({
          ...line,
          orderId: order.id,
          subtotal: Math.round(line.quantity * line.unitPrice * 100) / 100,
        })),
      )
      .forEach((orderLine, i) => {
        const offset = i * 7;
        placeholders.push(
          `($${offset + 1},$${offset + 2},$${offset + 3},$${offset + 4},$${offset + 5},$${offset + 6},$${offset + 7})`,
        );
        const orderId = orderIdMap.get(orderLine.orderId);
        values.push(
          orderId,
          orderLine.refId,
          orderLine.itemName,
          orderLine.category,
          orderLine.quantity,
          orderLine.unitPrice,
          orderLine.subtotal,
        );
      });

    await client.query(
      `INSERT INTO order_lines (order_id,item_ref_id,item_name,item_category,qty,unit_price,subtotal) VALUES ${placeholders.join(",")}`,
      values,
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

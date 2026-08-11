import { Pool, PoolClient, QueryResult } from "pg";
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

    let result = await batchInsert(
      client,
      "brands",
      ["name"],
      brands.map((brand) => [brand.name]),
    );

    const brandIdMap = buildIdMap(
      brands.map((brand) => brand.id),
      result.rows,
    );

    // outlets

    result = await batchInsert(
      client,
      "outlets",
      ["name", "brand_id"],
      outlets.map((outlet) => [outlet.name, brandIdMap.get(outlet.brandId)]),
    );

    const outletIdMap = buildIdMap(
      outlets.map((outlet) => outlet.id),
      result.rows,
    );

    // customers
    
    const customerPlaceholders = customers.map(() => "(DEFAULT)");
    result = await client.query(
      `INSERT INTO customers (id) VALUES ${customerPlaceholders.join(",")} RETURNING id`,
    );

    const customerIdMap = buildIdMap(
      customers.map((customer) => customer.id),
      result.rows,
    );

    // orders

    result = await batchInsert(
      client,
      "orders",
      ["outlet_id", "customer_id", "ordered_at"],
      orders.map((order) => [
        outletIdMap.get(order.outletId),
        order.customerId ? customerIdMap.get(order.customerId) : null,
        order.orderedAt,
      ]),
    );

    const orderIdMap = buildIdMap(
      orders.map((order) => order.id),
      result.rows,
    );

    // order_lines

    await batchInsert(
      client,
      "order_lines",
      [
        "order_id",
        "item_ref_id",
        "item_name",
        "item_category",
        "qty",
        "unit_price",
        "subtotal",
      ],
      orders.flatMap((order, i) =>
        order.lines.map((line) => [
          orderIdMap.get(order.id),
          line.refId,
          line.itemName,
          line.category,
          line.quantity,
          line.unitPrice,
          Math.round(line.quantity * line.unitPrice * 100) / 100,
        ]),
      ),
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function batchInsert(
  client: PoolClient,
  table: string,
  columns: string[],
  rows: unknown[][],
): Promise<QueryResult> {
  const columnCount = columns.length;
  const placeholders = rows.map((_, i) => {
    const offset = i * columnCount;
    const cells = Array.from(
      { length: columnCount },
      (_, j) => `$${offset + j + 1}`,
    );
    return `(${cells.join(",")})`;
  });
  const values = rows.flat();

  return await client.query(
    `INSERT INTO ${table} (${columns.join(",")}) VALUES ${placeholders.join(",")} RETURNING id`,
    values,
  );
}

function buildIdMap(
  generatorIds: string[],
  resultRows: { id: string }[],
): Map<string, string> {
  const map = new Map<string, string>();
  resultRows.forEach((row, i) => map.set(generatorIds[i], row.id));
  return map;
}

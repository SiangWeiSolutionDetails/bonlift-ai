import { describe, it, expect } from "vitest";
import { createRng } from "./rng.js";
import { generateItems } from "./generateItems.js";
import { generateOrdersForOutlet } from "./generateOrders.js";

describe("generateOrdersForOutlet", () => {
  it("produces more orders for high-popularity items than low-popularity ones", () => {
    const rng = createRng(42);
    const items = generateItems("brand_1", 10, rng);
    const orders = generateOrdersForOutlet(
      "outlet_1",
      items,
      ["customer_1"],
      { daysOfHistory: 30, ordersPerOutletPerDay: 20 },
      rng
    );

    const counts = new Map<string, number>();
    for (const order of orders) {
      for (const line of order.lines) {
        counts.set(line.refId, (counts.get(line.refId) ?? 0) + line.quantity);
      }
    }

    const topItemCount = counts.get(items[0].refId) ?? 0;
    const bottomItemCount = counts.get(items[items.length - 1].refId) ?? 0;
    expect(topItemCount).toBeGreaterThan(bottomItemCount);
  });

  it("is deterministic for a fixed seed", () => {
    const rngA = createRng(7);
    const itemsA = generateItems("brand_1", 5, rngA);
    const ordersA = generateOrdersForOutlet(
      "outlet_1", itemsA, ["c1"], { daysOfHistory: 5, ordersPerOutletPerDay: 3 }, rngA
    );

    const rngB = createRng(7);
    const itemsB = generateItems("brand_1", 5, rngB);
    const ordersB = generateOrdersForOutlet(
      "outlet_1", itemsB, ["c1"], { daysOfHistory: 5, ordersPerOutletPerDay: 3 }, rngB
    );

    expect(ordersA).toEqual(ordersB);
  });
});

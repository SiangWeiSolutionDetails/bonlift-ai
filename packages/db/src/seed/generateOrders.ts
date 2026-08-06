import type { GeneratedItem, GeneratedOrder, GeneratedOrderLine } from "./types.js";

function pickWeighted(items: GeneratedItem[], rng: () => number): GeneratedItem {
  const totalWeight = items.reduce((sum, item) => sum + item.popularityWeight, 0);
  let threshold = rng() * totalWeight;
  for (const item of items) {
    threshold -= item.popularityWeight;
    if (threshold <= 0) return item;
  }
  return items[items.length - 1];
}

export function generateOrdersForOutlet(
  outletId: string,
  outletItems: GeneratedItem[],
  customerIds: string[],
  config: { daysOfHistory: number; ordersPerOutletPerDay: number },
  rng: () => number
): GeneratedOrder[] {
  const orders: GeneratedOrder[] = [];
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  for (let day = 0; day < config.daysOfHistory; day++) {
    for (let o = 0; o < config.ordersPerOutletPerDay; o++) {
      const orderedAt = new Date(now - day * dayMs - Math.floor(rng() * dayMs));
      const lineCount = 1 + Math.floor(rng() * 4);
      const lines: GeneratedOrderLine[] = Array.from({ length: lineCount }, () => {
        const item = pickWeighted(outletItems, rng);
        return {
          refId: item.refId,
          itemName: item.name,
          category: item.category,
          quantity: 1 + Math.floor(rng() * 3),
          unitPrice: item.price,
        };
      });
      orders.push({
        id: `${outletId}_order_${day}_${o}`,
        outletId,
        customerId: rng() < 0.6 ? customerIds[Math.floor(rng() * customerIds.length)] : null,
        orderedAt,
        lines,
      });
    }
  }
  return orders;
}

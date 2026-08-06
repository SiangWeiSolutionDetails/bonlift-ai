import { createRng } from "./rng.js";
import { generateBrands } from "./generateBrands.js";
import { generateOutlets } from "./generateOutlets.js";
import { generateItems } from "./generateItems.js";
import { generateCustomers } from "./generateCustomers.js";
import { generateOrdersForOutlet } from "./generateOrders.js";
import type { SeedConfig, GeneratedDataset, GeneratedItem } from "./types.js";

export function generateDataset(config: SeedConfig): GeneratedDataset {
  const rng = createRng(config.randomSeed);
  const brands = generateBrands();
  const outlets = generateOutlets(config.outletCount, brands, rng);

  // Items are generated once per brand (not per outlet) — a brand's outlets share one catalog.
  const items = brands.flatMap((brand) => generateItems(brand.id, config.itemsPerBrand, rng));
  const itemsByBrand = new Map<string, GeneratedItem[]>(
    brands.map((brand) => [brand.id, items.filter((i) => i.brandId === brand.id)])
  );

  const customers = generateCustomers(config.customerCount);
  const customerIds = customers.map((c) => c.id);

  // Every outlet draws from its brand's full catalog — no per-outlet menu subset.
  const orders = outlets.flatMap((outlet) =>
    generateOrdersForOutlet(
      outlet.id,
      itemsByBrand.get(outlet.brandId)!,
      customerIds,
      { daysOfHistory: config.daysOfHistory, ordersPerOutletPerDay: config.ordersPerOutletPerDay },
      rng
    )
  );

  return { brands, outlets, customers, orders };
}

export * from "./types.js";

import type { GeneratedItem } from "./types.js";

const CATEGORIES = ["mains", "sides", "drinks", "desserts"];

// Zipf-ish weight: item rank r out of n gets weight proportional to 1/r,
// so a few items dominate and a long tail is rarely ordered.
function zipfWeight(rank: number): number {
  return 1 / rank;
}

export function generateItems(
  brandId: string,
  itemsPerBrand: number,
  rng: () => number
): GeneratedItem[] {
  return Array.from({ length: itemsPerBrand }, (_, i) => {
    const rank = i + 1;
    return {
      brandId,
      refId: `${rank}`,
      name: `Item ${rank}`,
      category: CATEGORIES[i % CATEGORIES.length],
      price: Math.round((5 + rng() * 20) * 100) / 100,
      popularityWeight: zipfWeight(rank),
    };
  });
}

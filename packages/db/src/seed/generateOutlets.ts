import type { GeneratedBrand, GeneratedOutlet } from "./types.js";

export function generateOutlets(
  count: number,
  brands: GeneratedBrand[],
  rng: () => number
): GeneratedOutlet[] {
  return Array.from({ length: count }, (_, i) => {
    const brand = brands[i % brands.length];
    return {
      id: `outlet_${i + 1}`,
      name: `${brand.name} #${i + 1}`,
      brandId: brand.id,
    };
  });
}

import type { GeneratedBrand } from "./types.js";

const BRAND_NAMES = ["Urban Kitchen", "Noodle House", "Cafe Verde"];

export function generateBrands(): GeneratedBrand[] {
  return BRAND_NAMES.map((name, i) => ({ id: `brand_${i + 1}`, name }));
}

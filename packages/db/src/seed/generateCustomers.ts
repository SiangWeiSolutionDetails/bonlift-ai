import type { GeneratedCustomer } from "./types.js";

export function generateCustomers(count: number): GeneratedCustomer[] {
  return Array.from({ length: count }, (_, i) => ({ id: `customer_${i + 1}` }));
}

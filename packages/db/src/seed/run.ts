import { closePool, getPool } from "../pool.js";
import { generateDataset, type SeedConfig } from "./index.js";
import { persistDataset } from "./persist.js";

const config: SeedConfig = {
  outletCount: 5,
  itemsPerBrand: 10,
  customerCount: 10,
  daysOfHistory: 30,
  ordersPerOutletPerDay: 10,
  randomSeed: 88,
};

const dataset = generateDataset(config);

try {
  await persistDataset(getPool(), dataset);
} finally {
  await closePool();
}

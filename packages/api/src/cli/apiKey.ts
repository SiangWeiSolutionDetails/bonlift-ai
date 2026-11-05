import { closePool, getPool } from "@bonlift-ai/db";
import { userInfo } from "node:os";
import { parseArgs } from "node:util";
import { AppError } from "../errors.js";
import {
  createBrandApiKey,
  revokeBrandApiKey,
} from "../services/brandApiKey.service.js";

// Keys are created on the server only, until the admin app has a login (H1): an open admin route would let anyone
// create keys. Usage:
//   npm run api-key -w packages/api -- create --brand <brandId> --name <label> [--expires-in-days <n>]
//   npm run api-key -w packages/api -- revoke --prefix <keyPrefix>
const USAGE = `Usage:
  create --brand <brandId> --name <label> [--expires-in-days <n>]
  revoke --prefix <keyPrefix>`;

async function create(values: Record<string, string | undefined>) {
  const created = await createBrandApiKey(getPool(), {
    brandId: values.brand ?? "",
    name: values.name ?? "",
    createdBy: `cli:${userInfo().username}`,
    expiresInDays: values["expires-in-days"]
      ? Number(values["expires-in-days"])
      : undefined,
  });

  console.log(`Created key ${created.keyPrefix} (${created.name}) for brand ${created.brandId}.`);
  console.log(`Expires: ${created.expiresAt ?? "never"}`);
  console.log("\nKey (shown once, store it in the caller's secret store now):\n");
  console.log(created.key);
}

async function revoke(values: Record<string, string | undefined>) {
  const revoked = await revokeBrandApiKey(getPool(), values.prefix ?? "");
  console.log(
    `Revoked key ${values.prefix} (${revoked.name}) for brand ${revoked.brandId}. ` +
      "Running API instances may accept it for up to a minute (key cache).",
  );
}

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      brand: { type: "string" },
      name: { type: "string" },
      "expires-in-days": { type: "string" },
      prefix: { type: "string" },
    },
  });

  const commands: Record<string, typeof create> = { create, revoke };
  const command = commands[positionals[0] ?? ""];
  if (!command) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  try {
    await command(values);
  } catch (error) {
    console.error(error instanceof AppError ? error.message : error);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
}

main();

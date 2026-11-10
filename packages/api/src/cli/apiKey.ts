import { closePool, getPool } from "@bonlift-ai/db";
import { userInfo } from "node:os";
import { parseArgs } from "node:util";
import { AppError, ValidationError } from "../errors.js";
import {
  createBrandApiKey,
  revokeBrandApiKey,
  UNKNOWN_CHANNEL_MESSAGE,
} from "../services/brandApiKey.service.js";
import { listBrandChannels } from "../services/brandChannel.service.js";

// Keys are created on the server only, until the admin app has a login (H1): an open admin route would let anyone
// create keys. Usage:
//   npm run api-key -w packages/api -- create --brand <brandId> --channel <code> --name <label> [--expires-in-days <n>]
//   npm run api-key -w packages/api -- revoke --prefix <keyPrefix>
const USAGE = `Usage:
  create --brand <brandId> --channel <code> --name <label> [--expires-in-days <n>]
    <code> is one of tqr, sok or pos; switch it on for the brand in the admin before the key can serve
  revoke --prefix <keyPrefix>`;

// Only on failure: lists the brand's channel codes, so the operator can retry with a valid one.
async function describeUnknownChannel(brandId: string, code: string): Promise<ValidationError> {
  const { channels } = await listBrandChannels(getPool(), brandId);
  const known = channels.map((candidate) => candidate.code).join(", ") || "none";
  return new ValidationError(`The brand has no channel ${code}. Its channels: ${known}.`);
}

// The create statement resolves the channel by its code, which is what an operator knows; the key stores its id.
async function create(values: Record<string, string | undefined>) {
  const brandId = values.brand ?? "";
  const channelCode = values.channel ?? "";
  const created = await createBrandApiKey(getPool(), {
    brandId,
    name: values.name ?? "",
    channelCode,
    createdBy: `cli:${userInfo().username}`,
    expiresInDays: values["expires-in-days"]
      ? Number(values["expires-in-days"])
      : undefined,
  }).catch(async (error) => {
    throw error instanceof ValidationError && error.message === UNKNOWN_CHANNEL_MESSAGE
      ? await describeUnknownChannel(brandId, channelCode)
      : error;
  });

  console.log(
    `Created key ${created.keyPrefix} (${created.name}) for channel ${created.channelCode} of brand ${created.brandId}.`,
  );
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
      channel: { type: "string" },
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

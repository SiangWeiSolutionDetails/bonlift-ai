import type { Static, TSchema } from "typebox";
import Value from "typebox/value";
import { ValidationError } from "../errors.js";

export function assertValid<T extends TSchema>(
  schema: T,
  data: unknown,
): asserts data is Static<T> {
  if (Value.Check(schema, data)) return;

  const errors = Value.Errors(schema, data);
  // An unknown property yields a generic "schema is false" error alongside the
  // descriptive additionalProperties one, so prefer the descriptive error.
  const error = errors.find((e) => e.keyword !== "boolean") ?? errors[0];

  if (!error) {
    throw new ValidationError("Invalid input.");
  }

  const field = error.instancePath.slice(1);
  throw new ValidationError(
    field ? `${field} ${error.message}` : error.message,
  );
}

export function assertValidUrl(url: string) {
  try {
    new URL(url);
  } catch (error) {
    throw new ValidationError("Invalid URL.");
  }
}

// Format tokens: YYYY, MM, DD; any other characters must match literally (e.g. "YYYYMMDD", "YYYY-MM-DD").
export function assertValidDate(value: string, format: string) {
  const pattern = format
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace("YYYY", "(?<year>\\d{4})")
    .replace("MM", "(?<month>\\d{2})")
    .replace("DD", "(?<day>\\d{2})");
  const match = new RegExp(`^${pattern}$`).exec(value);

  const year = Number(match?.groups?.year);
  const month = Number(match?.groups?.month);
  const day = Number(match?.groups?.day);
  // Date.UTC rolls impossible dates over (30 Feb → 2 Mar), so a mismatch means the date doesn't exist.
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    !match ||
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new ValidationError(`${value} is not a valid ${format} date.`);
  }
}

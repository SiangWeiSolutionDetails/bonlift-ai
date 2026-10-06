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
  throw new ValidationError(field ? `${field} ${error.message}` : error.message);
}

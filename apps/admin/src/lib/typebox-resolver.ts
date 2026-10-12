import { get, set, type FieldErrors, type FieldValues, type Resolver } from "react-hook-form";
import type { Static, TObject } from "typebox";
import { Value } from "typebox/value";

// "/tenantId" -> "tenantId"; an error on the object itself (e.g. an unexpected extra property) has an empty path
function toFieldName(instancePath: string) {
  return instancePath === "" ? "root" : instancePath.slice(1).replaceAll("/", ".");
}

// An empty field is "required" to the user, whatever keyword the schema actually failed on
function toMessageKey(keyword: string, value: unknown) {
  return value === "" ? "validation.required" : `validation.${keyword}`;
}

function toFieldErrors<T extends FieldValues>(schema: TObject, values: T) {
  const errors: FieldErrors<T> = {};
  for (const error of Value.Errors(schema, values)) {
    const name = toFieldName(error.instancePath);
    if (get(errors, name)) continue;
    set(errors, name, { type: error.keyword, message: toMessageKey(error.keyword, get(values, name)) });
  }
  return errors;
}

export function typeboxResolver<T extends TObject>(schema: T): Resolver<Static<T>> {
  return async (values) =>
    Value.Check(schema, values)
      ? { values, errors: {} }
      : { values: {}, errors: toFieldErrors(schema, values) };
}

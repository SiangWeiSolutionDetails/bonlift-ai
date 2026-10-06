import { describe, expect, it } from "vitest";
import Type from "typebox";
import { ValidationError } from "../errors.js";
import { assertValid } from "./validate.js";

const UpdateSchema = Type.Object(
  {
    name: Type.Optional(Type.String({ minLength: 1 })),
    isActive: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false, minProperties: 1 },
);

const IdSchema = Type.Object({ id: Type.String({ format: "uuid" }) });

describe("assertValid", () => {
  it("does not throw for valid data", () => {
    expect(() => assertValid(UpdateSchema, { isActive: false })).not.toThrow();
  });

  it("throws ValidationError for an empty object when minProperties is set", () => {
    expect(() => assertValid(UpdateSchema, {})).toThrow(ValidationError);
  });

  it("reports the descriptive error for an unknown property", () => {
    expect(() => assertValid(UpdateSchema, { is_active: false })).toThrow(
      "must not have additional properties",
    );
  });

  it("prefixes the message with the failing field", () => {
    expect(() => assertValid(UpdateSchema, { name: "" })).toThrow(
      "name must not have fewer than 1 characters",
    );
  });

  it("rejects a malformed uuid", () => {
    expect(() => assertValid(IdSchema, { id: "abc" })).toThrow(
      'id must match format "uuid"',
    );
  });

  it("rejects a non-object input", () => {
    expect(() => assertValid(UpdateSchema, undefined)).toThrow(ValidationError);
  });
});

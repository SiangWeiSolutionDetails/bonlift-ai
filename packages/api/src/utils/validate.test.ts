import { describe, expect, it } from "vitest";
import Type from "typebox";
import { ValidationError } from "../errors.js";
import { assertValid, assertValidUrl } from "./validate.js";

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

describe("assertValidUrl", () => {
  it.each([
    "http://localhost:4000/mock-data-source/orders",
    "https://pos.example.com/export?outlet=BEDOK%20MALL",
    "http://[::1]:4000/orders",
  ])("does not throw for %s", (url) => {
    expect(() => assertValidUrl(url)).not.toThrow();
  });

  it.each([
    ["an empty string", ""],
    ["plain text", "not a url"],
    ["a scheme without a host", "http://"],
    ["a port above 65535", "https://pos.example.com:99999/export"],
    ["a space in the host", "https://pos example.com/export"],
  ])("throws ValidationError for %s", (_label, url) => {
    expect(() => assertValidUrl(url)).toThrow(ValidationError);
    expect(() => assertValidUrl(url)).toThrow("Invalid URL.");
  });

  // Protocol, credentials and fragments are rejected by the contract's url pattern, not here.
  it("does not check the protocol", () => {
    expect(() => assertValidUrl("ftp://pos.example.com/file")).not.toThrow();
  });
});

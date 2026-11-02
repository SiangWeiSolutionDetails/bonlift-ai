import { describe, expect, it } from "vitest";
import { findServingCaller, parseServingApiKeys } from "./servingAuth.js";

const TQR_KEY = "t".repeat(32);
const POS_KEY = "p".repeat(40);

describe("parseServingApiKeys", () => {
  it.each([undefined, "", "  "])("returns no keys for %j", (raw) => {
    expect(parseServingApiKeys(raw)).toStrictEqual([]);
  });

  it("parses one key per caller and keeps only hashes", () => {
    const keys = parseServingApiKeys(`tqr:${TQR_KEY}, pos:${POS_KEY}`);

    expect(keys.map((key) => key.caller)).toStrictEqual(["tqr", "pos"]);
    expect(keys.every((key) => !key.keyHash.toString().includes(TQR_KEY))).toBe(true);
  });

  it.each([
    ["an entry has no caller", `:${TQR_KEY}`],
    ["an entry has no separator", TQR_KEY],
    ["a key is shorter than 32 characters", "tqr:short"],
  ])("throws when %s", (_name, raw) => {
    expect(() => parseServingApiKeys(raw)).toThrow();
  });
});

describe("findServingCaller", () => {
  const keys = parseServingApiKeys(`tqr:${TQR_KEY},pos:${POS_KEY}`);

  it("returns the caller of a valid key", () => {
    expect(findServingCaller(keys, POS_KEY)).toBe("pos");
  });

  it.each([
    ["a wrong key", "x".repeat(32)],
    ["a key differing in one character", `${TQR_KEY.slice(0, -1)}x`],
    ["no key", undefined],
    ["an empty key", ""],
  ])("returns null for %s", (_name, presented) => {
    expect(findServingCaller(keys, presented)).toBeNull();
  });

  it("rejects every key when none are configured", () => {
    expect(findServingCaller([], TQR_KEY)).toBeNull();
  });
});

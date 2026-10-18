import { describe, expect, it } from "vitest";
import { matchLanguage } from "./languages";

describe("matchLanguage", () => {
  it.each([
    ["en", "en"],
    ["en-GB", "en"],
    ["zh-CN", "zh-CN"],
    ["zh", "zh-CN"],
    ["zh-SG", "zh-CN"],
    ["ZH-hans", "zh-CN"],
  ])("maps %s to %s", (candidate, expected) => {
    expect(matchLanguage(candidate)).toBe(expected);
  });

  it("returns undefined for an unsupported language", () => {
    expect(matchLanguage("th-TH")).toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";
import { resources } from "./resources";

function flattenKeys(value: object, prefix = ""): string[] {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof child === "object" && child !== null ? flattenKeys(child, path) : [path];
  });
}

function placeholders(text: string) {
  return [...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((match) => match[1]).sort();
}

function get(value: object, path: string): unknown {
  return path.split(".").reduce<unknown>((node, key) => (node as Record<string, unknown>)?.[key], value);
}

const { en, ...translations } = resources;

describe.each(Object.entries(translations))("locale %s", (_, locale) => {
  describe.each(Object.entries(en))("namespace %s", (namespace, source) => {
    const target = locale[namespace as keyof typeof locale];

    it("has exactly the same keys as en", () => {
      expect(flattenKeys(target).sort()).toEqual(flattenKeys(source).sort());
    });

    it("has no empty strings", () => {
      const empty = flattenKeys(target).filter((key) => get(target, key) === "");
      expect(empty).toEqual([]);
    });

    it("keeps every {{placeholder}} from en", () => {
      for (const key of flattenKeys(source)) {
        expect(placeholders(String(get(target, key))), key).toEqual(
          placeholders(String(get(source, key))),
        );
      }
    });
  });
});

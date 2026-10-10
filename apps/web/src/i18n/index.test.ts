import { describe, expect, it as test } from "vitest";

import { en, getMessages, it } from "./index";

function leafKeys(value: unknown, prefix = ""): string[] {
  if (typeof value === "string") {
    return [prefix];
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  return Object.entries(value).flatMap(([key, nested]) =>
    leafKeys(nested, prefix ? `${prefix}.${key}` : key),
  );
}

function leafValues(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  return Object.values(value).flatMap(leafValues);
}

describe("message catalogs", () => {
  test("keeps English and Italian keys in exact parity", () => {
    expect(leafKeys(it).sort()).toEqual(leafKeys(en).sort());
  });

  test("contains only complete, non-empty copy", () => {
    for (const value of [...leafValues(en), ...leafValues(it)]) {
      expect(value.trim()).not.toBe("");
      expect(value).not.toMatch(/\b(?:TODO|TBD|lorem ipsum)\b/i);
    }
  });

  test("loads the requested catalog and safely falls back to English", () => {
    expect(getMessages("it")).toBe(it);
    expect(getMessages("en")).toBe(en);
    expect(getMessages("de-DE")).toBe(en);
  });
});

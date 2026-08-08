import { describe, expect, it as test } from "vitest";

import {
  assertLocale,
  defaultLocale,
  en,
  getAlternates,
  getMessages,
  isLocale,
  it,
  localeLabels,
  locales,
  localizedPath,
  normalizeLocale,
} from "./index";

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

describe("locale configuration", () => {
  test("keeps English as the default and exposes every locale label", () => {
    expect(defaultLocale).toBe("en");
    expect(locales).toEqual(["en", "it"]);
    expect(Object.keys(localeLabels).sort()).toEqual([...locales].sort());
  });

  test("validates and normalizes BCP 47 language tags", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("it")).toBe(true);
    expect(isLocale("EN")).toBe(false);
    expect(isLocale(null)).toBe(false);
    expect(normalizeLocale("EN-us")).toBe("en");
    expect(normalizeLocale("it_IT")).toBe("it");
    expect(normalizeLocale(" fr-FR ")).toBe("en");
    expect(normalizeLocale(undefined)).toBe("en");
  });

  test("asserts supported locales", () => {
    expect(() => assertLocale("it")).not.toThrow();
    expect(() => assertLocale("fr")).toThrow(RangeError);
  });
});

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

describe("localized URLs", () => {
  test.each([
    ["/", "en", "/en"],
    ["/latest", "it", "/it/latest"],
    ["latest", "en", "/en/latest"],
    ["/en/latest", "en", "/en/latest"],
    ["/en/latest", "it", "/it/latest"],
    ["/it/search?q=agents#results", "en", "/en/search?q=agents#results"],
    ["?q=agents", "it", "/it?q=agents"],
  ] as const)("localizes %s for %s", (pathname, locale, expected) => {
    expect(localizedPath(pathname, locale)).toBe(expected);
  });

  test("rejects URLs outside the application", () => {
    expect(() => localizedPath("https://example.com/latest", "en")).toThrow(TypeError);
    expect(() => localizedPath("//example.com/latest", "it")).toThrow(TypeError);
  });

  test("builds canonical, language and x-default alternates", () => {
    expect(getAlternates("/it/articles/agents?ref=home")).toEqual({
      canonical: "/en/articles/agents?ref=home",
      languages: {
        en: "/en/articles/agents?ref=home",
        it: "/it/articles/agents?ref=home",
        "x-default": "/en/articles/agents?ref=home",
      },
    });
    expect(getAlternates("/articles/agenti", "it").canonical).toBe("/it/articles/agenti");
  });
});

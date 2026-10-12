import { describe, expect, it } from "vitest";

import { pageCapabilities, parsePageInput, parseStudioInput } from "./page";

describe("parsePageInput", () => {
  it("accepts what the published schema accepts and applies its defaults", () => {
    expect(parsePageInput("open_article", { slug: "gpt-launch" })).toEqual({
      ok: true,
      input: { locale: "en", slug: "gpt-launch" },
    });
    expect(parsePageInput("search_articles", { query: "agents" })).toMatchObject({
      ok: true,
      input: { locale: "en", query: "agents", limit: 10 },
    });
    expect(parsePageInput("read_open_article", undefined)).toEqual({ ok: true, input: {} });
  });

  it("names the failing field and the tool when the arguments are invalid", () => {
    const missing = parsePageInput("open_article", { locale: "en" });
    expect(missing).toMatchObject({ ok: false });
    expect(missing.ok === false && missing.error).toMatch(/open_article.*slug/);

    const tooShort = parsePageInput("search_articles", { query: "a" });
    expect(tooShort.ok).toBe(false);
    expect(parsePageInput("filter_feed", { claimStatus: "maybe" }).ok).toBe(false);
    expect(parsePageInput("save_article", { slug: "Not A Slug" }).ok).toBe(false);
  });

  it("offers no argument that the site cannot honour", () => {
    const filter = pageCapabilities.find((capability) => capability.name === "filter_feed")!;
    expect(Object.keys(filter.inputSchema.properties as object).sort()).toEqual(["claimStatus", "entity", "locale"]);
  });
});

describe("parseStudioInput", () => {
  it("defaults the locale and takes the slug of an article that is not new", () => {
    expect(parseStudioInput("open_article_editor", {})).toEqual({ ok: true, input: { locale: "en" } });
    expect(parseStudioInput("open_article_editor", { locale: "it", slug: "gpt-launch" })).toEqual({
      ok: true,
      input: { locale: "it", slug: "gpt-launch" },
    });
    expect(parseStudioInput("read_article_form", undefined)).toEqual({ ok: true, input: {} });
  });

  it("takes any subset of the form's fields and nothing the form could not hold", () => {
    expect(parseStudioInput("fill_article_form", {})).toEqual({ ok: true, input: {} });
    expect(parseStudioInput("fill_article_form", { title: "Short", featured: true, translationOf: null, coverImage: null })).toMatchObject({
      ok: true,
      input: { title: "Short", featured: true, translationOf: null, coverImage: null },
    });
    for (const input of [
      { status: "published" },
      { slug: "Not A Slug" },
      { claimStatus: "maybe" },
      { distribution: ["fax"] },
      { keyPoints: ["a", "b", "c", "d"] },
      { scheduledFor: "tomorrow" },
      { coverImage: "https://elsewhere.example/cover.png" },
      { entities: [{ isPrimary: true }] },
      { content: "x".repeat(100_001) },
    ]) {
      expect(parseStudioInput("fill_article_form", input).ok, JSON.stringify(input).slice(0, 60)).toBe(false);
    }
  });

  it("names the failing field and the tool, and drops what the schema does not know", () => {
    const bad = parseStudioInput("fill_article_form", { status: "published" });
    expect(bad.ok === false && bad.error).toMatch(/fill_article_form.*status/);
    expect(parseStudioInput("fill_article_form", { title: "A title", confirmed: true })).toEqual({ ok: true, input: { title: "A title" } });
  });
});

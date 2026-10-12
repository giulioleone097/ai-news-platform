import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPublishedStories: vi.fn(),
  getPublicCategories: vi.fn(),
  getCoveredEntities: vi.fn(),
}));

vi.mock("@atlasnews/adapters/config/env", () => ({ getPublicSiteUrl: () => "https://news.example.com" }));
vi.mock("@/lib/editorial-queries", () => ({ getPublicCategories: mocks.getPublicCategories }));
vi.mock("@/lib/feeds/data", () => ({
  getCoveredEntities: mocks.getCoveredEntities,
  getPublishedStories: mocks.getPublishedStories,
}));

import { claimStatuses } from "@atlasnews/core/editorial/domain/article";
import sitemap from "./sitemap";

const base = "https://news.example.com";

describe("sitemap", () => {
  beforeEach(() => {
    mocks.getPublishedStories.mockReset().mockResolvedValue([]);
    mocks.getPublicCategories.mockReset().mockResolvedValue([]);
    mocks.getCoveredEntities.mockReset().mockResolvedValue([{ slug: "openai" }]);
  });

  it("lists the entity index and every claim status page with hreflang alternates in each locale", async () => {
    const entries = await sitemap();
    const byUrl = new Map(entries.map((entry) => [entry.url, entry]));

    const entityIndex = byUrl.get(`${base}/en/entities`);
    expect(entityIndex?.alternates?.languages).toEqual({
      en: `${base}/en/entities`,
      it: `${base}/it/entities`,
      "x-default": `${base}/en/entities`,
    });
    expect(byUrl.get(`${base}/it/entities`)?.alternates?.languages).toEqual(entityIndex?.alternates?.languages);

    for (const status of claimStatuses) {
      const english = byUrl.get(`${base}/en/status/${status}`);
      expect(english?.alternates?.languages).toEqual({
        en: `${base}/en/status/${status}`,
        it: `${base}/it/status/${status}`,
        "x-default": `${base}/en/status/${status}`,
      });
      expect(byUrl.get(`${base}/it/status/${status}`)).toBeDefined();
    }
  });

  it("lists every published story, however many, and links each to its translation", async () => {
    // More than a repository page (50): the older ones used to drop out of the sitemap and its hreflang links.
    const story = (locale: "en" | "it", index: number) => ({
      translationKey: `story-${index}`,
      slug: `${locale}-slug-${index}`,
      updatedAt: "2026-10-01T00:00:00.000Z",
      featured: false,
    });
    const indexes = Array.from({ length: 120 }, (_, index) => index);
    mocks.getPublishedStories.mockImplementation(async (locale: "en" | "it") =>
      indexes
        // The Italian side has no translation of the last story.
        .filter((index) => locale === "en" || index < 119)
        .map((index) => story(locale, index)),
    );

    const byUrl = new Map((await sitemap()).map((entry) => [entry.url, entry]));

    expect([...byUrl.keys()].filter((url) => url.includes("/articles/"))).toHaveLength(239);
    expect(byUrl.get(`${base}/it/articles/it-slug-100`)?.alternates?.languages).toEqual({
      en: `${base}/en/articles/en-slug-100`,
      it: `${base}/it/articles/it-slug-100`,
      "x-default": `${base}/en/articles/en-slug-100`,
    });
    // Without a translation the other language points at the story's own slug, as before.
    expect(byUrl.get(`${base}/en/articles/en-slug-119`)?.alternates?.languages?.it).toBe(
      `${base}/it/articles/en-slug-119`,
    );
  });

  it("keeps the entity pages next to the new index entries", async () => {
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls).toContain(`${base}/en/entities/openai`);
    expect(urls).toContain(`${base}/it/entities/openai`);
  });

  it("lists the support, privacy and terms pages in both languages", async () => {
    const byUrl = new Map((await sitemap()).map((entry) => [entry.url, entry]));
    for (const page of ["support", "privacy", "terms"]) {
      expect(byUrl.get(`${base}/en/${page}`)?.alternates?.languages).toEqual({
        en: `${base}/en/${page}`,
        it: `${base}/it/${page}`,
        "x-default": `${base}/en/${page}`,
      });
      expect(byUrl.get(`${base}/it/${page}`)).toBeDefined();
    }
  });
});

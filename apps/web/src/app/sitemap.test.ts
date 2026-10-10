import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  searchPublishedArticles: vi.fn(),
  getPublicCategories: vi.fn(),
  getCoveredEntities: vi.fn(),
}));

vi.mock("@atlasnews/adapters/config/env", () => ({ getPublicSiteUrl: () => "https://news.example.com" }));
vi.mock("@/lib/editorial-queries", () => ({
  searchPublishedArticles: mocks.searchPublishedArticles,
  getPublicCategories: mocks.getPublicCategories,
}));
vi.mock("@/lib/feeds/data", () => ({ getCoveredEntities: mocks.getCoveredEntities }));

import { claimStatuses } from "@atlasnews/core/editorial/domain/article";
import sitemap from "./sitemap";

const base = "https://news.example.com";

describe("sitemap", () => {
  beforeEach(() => {
    mocks.searchPublishedArticles.mockReset().mockResolvedValue({ items: [], nextCursor: null });
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

  it("keeps the entity pages next to the new index entries", async () => {
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls).toContain(`${base}/en/entities/openai`);
    expect(urls).toContain(`${base}/it/entities/openai`);
  });
});

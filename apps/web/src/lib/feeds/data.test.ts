import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ searchPublishedArticles: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: <T>(load: T) => load }));
vi.mock("@/lib/editorial-queries", () => ({ searchPublishedArticles: mocks.searchPublishedArticles }));
vi.mock("@/server/composition", () => ({ getPublicEditorialRepositories: () => ({}) }));

import { findTranslationSlug, getPublishedStories, getStoriesPublishedSince } from "./data";

const pageSize = 50;

/** A repository that holds `total` stories, newest first, and answers `pageSize` per call as the real ones do. */
function serveStories(total: number, publishedAt: (index: number) => string) {
  const stories = Array.from({ length: total }, (_, index) => ({
    id: `id-${index}`,
    slug: `slug-${index}`,
    translationKey: `key-${index}`,
    publishedAt: publishedAt(index),
  }));
  mocks.searchPublishedArticles.mockImplementation(async ({ cursor, limit }: { cursor?: { id: string }; limit: number }) => {
    expect(limit).toBeLessThanOrEqual(pageSize);
    const start = cursor ? stories.findIndex((story) => story.id === cursor.id) + 1 : 0;
    const items = stories.slice(start, start + limit);
    const last = items.at(-1);
    return {
      items,
      nextCursor: start + limit < total && last ? { id: last.id, publishedAt: last.publishedAt } : null,
    };
  });
}

describe("published story paging", () => {
  beforeEach(() => {
    mocks.searchPublishedArticles.mockReset();
  });

  it("follows the cursor past the first repository page", async () => {
    serveStories(120, () => "2026-10-01T00:00:00.000Z");

    const stories = await getPublishedStories("en");

    expect(stories).toHaveLength(120);
    expect(mocks.searchPublishedArticles).toHaveBeenCalledTimes(3);
  });

  it("finds the translation of a story that is not among the newest 50", async () => {
    serveStories(120, () => "2026-10-01T00:00:00.000Z");

    expect(await findTranslationSlug("key-100", "it")).toBe("slug-100");
    expect(await findTranslationSlug("no-such-key", "it")).toBeUndefined();
    expect(await findTranslationSlug("constructor", "it")).toBeUndefined();
  });

  it("stops paging at the first story older than the cut-off", async () => {
    serveStories(120, (index) => (index < 10 ? "2026-10-02T00:00:00.000Z" : "2026-09-01T00:00:00.000Z"));

    const stories = await getStoriesPublishedSince("en", new Date("2026-10-01T00:00:00.000Z"));

    expect(stories).toHaveLength(10);
    expect(mocks.searchPublishedArticles).toHaveBeenCalledTimes(1);
  });
});

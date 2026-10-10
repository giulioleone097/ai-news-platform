import { describe, expect, it } from "vitest";
import type { Article, ArticlePage, ArticleQuery } from "./article";
import type { ArticleRepository } from "./article-repository";
import { feedPageSize, getHomeFeed, groupByDay, rankEntities } from "./editorial-service";

function story(index: number, patch: Partial<Article> = {}) {
  // Stories are one hour apart, newest first.
  const publishedAt = new Date(Date.UTC(2026, 9, 10, 12) - index * 3_600_000).toISOString();
  return {
    id: `story-${String(index).padStart(2, "0")}`,
    publishedAt,
    updatedAt: publishedAt,
    featured: false,
    ...patch,
  } as Article;
}

function repositoryOf(stories: Article[]) {
  const queries: ArticleQuery[] = [];
  const repository = {
    async listPublished(query: ArticleQuery): Promise<ArticlePage> {
      queries.push(query);
      const items = stories.slice(0, query.limit);
      const last = items.at(-1);
      return {
        items,
        nextCursor: stories.length > items.length && last?.publishedAt
          ? { id: last.id, publishedAt: last.publishedAt }
          : null,
      };
    },
    async listCategories() {
      return [];
    },
  } as unknown as ArticleRepository;
  return { repository, queries };
}

describe("home feed", () => {
  it("leads with the newest story and groups the next twenty by day", async () => {
    const stories = Array.from({ length: 30 }, (_, index) => story(index));
    const { repository, queries } = repositoryOf(stories);

    const feed = await getHomeFeed(repository, "en");

    expect(queries[0].limit).toBe(feedPageSize + 1);
    expect(feed.lead?.id).toBe("story-00");
    const shown = feed.days.flatMap((day) => day.items);
    expect(shown).toHaveLength(feedPageSize);
    expect(shown[0].id).toBe("story-01");
    expect(feed.days.map((day) => day.date)).toEqual(["2026-10-10", "2026-10-09"]);
    expect(feed.nextCursor).toEqual({ id: "story-20", publishedAt: stories[20].publishedAt });
  });

  it("prefers the featured story as lead and does not repeat it", async () => {
    const stories = [story(0), story(1, { featured: true }), story(2)];
    const feed = await getHomeFeed(repositoryOf(stories).repository, "en");

    expect(feed.lead?.id).toBe("story-01");
    expect(feed.days.flatMap((day) => day.items).map((item) => item.id)).toEqual(["story-00", "story-02"]);
    expect(feed.nextCursor).toBeNull();
    expect(feed.updatedAt).toBe(stories[0].updatedAt);
  });

  it("returns an empty feed instead of failing when nothing is published", async () => {
    const feed = await getHomeFeed(repositoryOf([]).repository, "it");

    expect(feed).toMatchObject({ lead: null, days: [], nextCursor: null, updatedAt: null });
  });
});

describe("feed helpers", () => {
  it("starts a new group when the UTC day changes", () => {
    const items = [
      { publishedAt: "2026-10-10T00:05:00.000Z" },
      { publishedAt: "2026-10-09T23:55:00.000Z" },
      { publishedAt: "2026-10-09T08:00:00.000Z" },
    ];

    expect(groupByDay(items).map((day) => [day.date, day.items.length])).toEqual([
      ["2026-10-10", 1],
      ["2026-10-09", 2],
    ]);
  });

  it("ranks entities by stories, then products before companies, then name", () => {
    const ranked = rankEntities([
      { name: "Anthropic", kind: "company" as const, storyCount: 3 },
      { name: "Claude", kind: "product" as const, storyCount: 3 },
      { name: "Gemini", kind: "product" as const, storyCount: 0 },
      { name: "ChatGPT", kind: "product" as const, storyCount: 7 },
      { name: "Mistral", kind: "model" as const, storyCount: 3 },
    ]);

    expect(ranked.map((entity) => entity.name)).toEqual(["ChatGPT", "Claude", "Mistral", "Anthropic", "Gemini"]);
  });
});

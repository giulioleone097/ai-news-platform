import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ search: vi.fn() }));

vi.mock("@/lib/editorial-queries", () => ({ searchPublishedArticles: mocks.search }));

import { GET } from "./route";

const call = (query: string) => GET(new NextRequest(`https://news.example.com/api/articles?${query}`));

beforeEach(() => {
  mocks.search.mockReset();
  mocks.search.mockResolvedValue({ items: [], nextCursor: null });
});

describe("GET /api/articles", () => {
  it("passes the entity and status filters to the query", async () => {
    const response = await call("locale=en&entity=claude&status=rumour");

    expect(response.status).toBe(200);
    expect(mocks.search).toHaveBeenCalledWith(
      expect.objectContaining({ locale: "en", entity: "claude", claimStatus: "rumour", limit: 20 }),
    );
    expect(await response.json()).toEqual({ items: [], nextCursor: null });
  });

  it("serves the row fields of a story, and nothing heavier", async () => {
    mocks.search.mockResolvedValue({
      items: [{
        id: "a1", slug: "a-story", title: "A story", excerpt: "x", content: "y", coverImage: "/c.webp",
        publishedAt: "2026-10-10T10:34:00.000Z", claimStatus: "test",
        category: { slug: "tools", name: "Tools" },
        entities: [{ kind: "product", slug: "claude", name: "Claude", isPrimary: true }],
      }],
      nextCursor: null,
    });

    const { items } = await (await call("locale=it")).json();

    expect(items).toEqual([{
      id: "a1", slug: "a-story", title: "A story", publishedAt: "2026-10-10T10:34:00.000Z", claimStatus: "test",
      category: { slug: "tools", name: "Tools" }, entity: { slug: "claude", name: "Claude" },
    }]);
  });

  it.each([
    "locale=en&status=leaked",
    "locale=en&entity=Not%20A%20Slug",
    `locale=en&entity=${"a".repeat(81)}`,
    "locale=fr",
    "locale=en&cursor=not-a-cursor",
  ])("rejects %s with a 400 before querying", async (query) => {
    expect((await call(query)).status).toBe(400);
    expect(mocks.search).not.toHaveBeenCalled();
  });
});

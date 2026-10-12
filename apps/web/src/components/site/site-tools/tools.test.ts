import { describe, expect, it } from "vitest";
import { pageSpecs } from "@atlasnews/contract/page";
import { createSiteTools, parseArticleAttributes, type OpenArticle, type SiteToolsEnvironment } from "./tools";

const feedItem = (slug: string, claimStatus = "confirmed") => ({
  id: `id-${slug}`,
  slug,
  title: `Title of ${slug}`,
  publishedAt: "2026-10-01T09:00:00.000Z",
  claimStatus,
  category: { slug: "models", name: "Models" },
  entity: { slug: "openai", name: "OpenAI" },
});

const articleHtml = (slug: string) =>
  `<html><body><article data-article-id="id-${slug}" data-article-slug="${slug}" data-claim-status="confirmed"><h1>x</h1></article></body></html>`;

const openStory: OpenArticle = {
  id: "id-gpt-launch",
  slug: "gpt-launch",
  locale: "en",
  claimStatus: "confirmed",
  title: "GPT launch",
  entities: [{ slug: "openai", name: "OpenAI" }],
  path: "/en/articles/gpt-launch",
  url: "https://atlas.test/en/articles/gpt-launch",
};

function setup(options: { open?: OpenArticle | null; navigates?: boolean } = {}) {
  const requests: { url: string; method: string }[] = [];
  const visited: string[] = [];
  const saved = new Set<string>();
  const state = { open: options.open ?? null };
  const respond = (url: string): Response => {
    if (url.startsWith("/api/articles?")) {
      const params = new URL(url, "https://atlas.test").searchParams;
      const items = ["a-story", "b-story", "c-story"].map((slug) => feedItem(slug, params.get("status") ?? "confirmed"));
      return Response.json({ items, nextCursor: params.get("q") === "more" ? "cursor" : null });
    }
    if (url === "/en/articles/gpt-launch") return new Response(articleHtml("gpt-launch"), { status: 200 });
    if (url === "/en/articles/gpt-launch.md") return new Response("# GPT launch\n\nBody\n", { status: 200 });
    if (url === "/en/entities/openai") return new Response("", { status: 200 });
    if (url === "/en/articles/not-a-page") return new Response("<html></html>", { status: 200 });
    return new Response("missing", { status: 404 });
  };
  const env: SiteToolsEnvironment = {
    fetch: ((input: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      requests.push({ url: input, method });
      return Promise.resolve(respond(input));
    }) as typeof fetch,
    navigate: (path) => {
      visited.push(path);
      if (options.navigates === false) return Promise.resolve(false);
      if (path.includes("/articles/gpt-launch")) state.open = openStory;
      else state.open = null;
      return Promise.resolve(true);
    },
    openArticle: () => state.open,
    addBookmark: (id) => {
      const added = !saved.has(id);
      saved.add(id);
      return { added, count: saved.size };
    },
  };
  return { tools: createSiteTools(env), requests, visited, saved, state };
}

describe("search_articles", () => {
  it("searches through the site's API, shows the results page and returns the items", async () => {
    const { tools, requests, visited } = setup();
    const result = await tools.search_articles({ query: "open ai", limit: 2 });

    expect(requests).toEqual([{ url: "/api/articles?locale=en&q=open+ai", method: "GET" }]);
    expect(visited).toEqual(["/en/search?q=open+ai"]);
    expect(result).toMatchObject({ query: "open ai", path: "/en/search?q=open+ai", count: 2, hasMore: true });
    expect(result.items).toEqual([
      expect.objectContaining({ slug: "a-story", path: "/en/articles/a-story", claimStatus: "confirmed" }),
      expect.objectContaining({ slug: "b-story" }),
    ]);
    expect(result).not.toHaveProperty("notShownOnPage");
  });

  it("passes the filters to the API and says which ones the results page cannot show", async () => {
    const { tools, requests } = setup();
    const result = await tools.search_articles({ locale: "it", query: "agenti", entity: "openai", claimStatus: "rumour" });

    expect(requests[0].url).toBe("/api/articles?locale=it&q=agenti&entity=openai&status=rumour");
    expect(result.notShownOnPage).toEqual(["entity", "claimStatus"]);
  });

  it("answers an error for a query that is too short, and when the page does not open", async () => {
    expect(await setup().tools.search_articles({ query: "a" })).toEqual({
      error: expect.stringContaining("query"),
    });
    expect(await setup({ navigates: false }).tools.search_articles({ query: "agents" })).toEqual({
      error: "The page did not finish opening /en/search?q=agents.",
    });
  });
});

describe("filter_feed", () => {
  it("shows the status feed and returns its stories", async () => {
    const { tools, visited, requests } = setup();
    const result = await tools.filter_feed({ claimStatus: "rumour" });

    expect(visited).toEqual(["/en/status/rumour"]);
    expect(requests).toEqual([{ url: "/api/articles?locale=en&status=rumour", method: "GET" }]);
    expect(result).toMatchObject({ path: "/en/status/rumour", count: 3, hasMore: false });
    expect(result).not.toHaveProperty("notShownOnPage");
  });

  it("shows the entity feed, and says that a status is not shown with it", async () => {
    const { tools, visited, requests } = setup();
    const result = await tools.filter_feed({ locale: "en", entity: "openai", claimStatus: "test" });

    expect(requests[0]).toEqual({ url: "/en/entities/openai", method: "HEAD" });
    expect(visited).toEqual(["/en/entities/openai"]);
    expect(result).toMatchObject({ path: "/en/entities/openai", notShownOnPage: ["claimStatus"] });
  });

  it("returns to the main feed when no filter is set, and rejects unknown entities and statuses", async () => {
    const { tools, visited } = setup();
    expect(await tools.filter_feed({})).toMatchObject({ path: "/en" });
    expect(visited).toEqual(["/en"]);

    const unknown = setup();
    expect(await unknown.tools.filter_feed({ entity: "nobody" })).toEqual({ error: 'No entity "nobody" in locale en.' });
    expect(unknown.visited).toEqual([]);
    expect(await unknown.tools.filter_feed({ claimStatus: "maybe" })).toEqual({ error: expect.stringContaining("claimStatus") });
  });

  it("removes the date arguments that the site cannot honour", async () => {
    const { tools, requests } = setup();
    await tools.filter_feed({ from: "2026-01-01", to: "2026-02-01" });
    expect(requests[0].url).toBe("/api/articles?locale=en");
  });
});

describe("open_article", () => {
  it("opens the story and confirms with the title the page now shows", async () => {
    const { tools, visited } = setup();
    expect(await tools.open_article({ slug: "gpt-launch" })).toEqual({
      opened: true,
      path: "/en/articles/gpt-launch",
      title: "GPT launch",
    });
    expect(visited).toEqual(["/en/articles/gpt-launch"]);
  });

  it("answers an error for a missing story, a page that is not a story, or a bad slug", async () => {
    const { tools, visited } = setup();
    expect(await tools.open_article({ slug: "gone" })).toEqual({ error: 'No published article "gone" in locale en.' });
    expect(await tools.open_article({ slug: "not-a-page" })).toEqual({ error: '"not-a-page" is not an article page.' });
    expect(await tools.open_article({ slug: "Not A Slug" })).toEqual({ error: expect.stringContaining("slug") });
    expect(await tools.open_article({})).toEqual({ error: expect.stringContaining("slug") });
    expect(visited).toEqual([]);
  });
});

describe("read_open_article", () => {
  it("returns the story on screen with its Markdown", async () => {
    const { tools, requests } = setup({ open: openStory });
    expect(await tools.read_open_article({})).toEqual({
      title: "GPT launch",
      url: "https://atlas.test/en/articles/gpt-launch",
      locale: "en",
      slug: "gpt-launch",
      claimStatus: "confirmed",
      entities: [{ slug: "openai", name: "OpenAI" }],
      text: "# GPT launch\n\nBody\n",
    });
    expect(requests).toEqual([{ url: "/en/articles/gpt-launch.md", method: "GET" }]);
  });

  it("answers an error when no article is open", async () => {
    expect(await setup().tools.read_open_article(undefined)).toEqual({
      error: "No article is open. Open one with open_article first.",
    });
  });
});

describe("save_article", () => {
  it("adds the story to the bookmarks once, and says when it was already there", async () => {
    const { tools, saved } = setup();
    expect(await tools.save_article({ slug: "gpt-launch" })).toEqual({ saved: true, alreadySaved: false, count: 1 });
    expect(await tools.save_article({ slug: "gpt-launch" })).toEqual({ saved: true, alreadySaved: true, count: 1 });
    expect([...saved]).toEqual(["id-gpt-launch"]);
  });

  it("uses the open page instead of fetching it, and saves nothing for an unknown story", async () => {
    const open = setup({ open: openStory });
    await open.tools.save_article({ slug: "gpt-launch" });
    expect(open.requests).toEqual([]);

    const missing = setup();
    expect(await missing.tools.save_article({ slug: "gone" })).toEqual({ error: 'No published article "gone" in locale en.' });
    expect(missing.saved.size).toBe(0);
  });
});

describe("failures", () => {
  it("never throws: an unexpected error becomes a result, and so does a cancellation", async () => {
    const { tools } = setup({ open: openStory });
    const broken = createSiteTools({
      fetch: (() => Promise.reject(new Error("secret internals"))) as typeof fetch,
      navigate: () => Promise.resolve(true),
      openArticle: () => openStory,
      addBookmark: () => ({ added: true, count: 1 }),
    });
    expect(await broken.read_open_article({})).toEqual({ error: "read_open_article failed unexpectedly." });
    const controller = new AbortController();
    controller.abort();
    expect(await broken.read_open_article({}, controller.signal)).toEqual({ error: "read_open_article was cancelled." });
    expect(await tools.read_open_article({})).not.toHaveProperty("error");
  });
});

describe("the catalogue's outputs", () => {
  it("are what the handlers return", async () => {
    const { tools } = setup();
    await tools.open_article({ slug: "gpt-launch" });
    const results = {
      search_articles: await tools.search_articles({ query: "open ai", limit: 2 }),
      filter_feed: await tools.filter_feed({ claimStatus: "test" }),
      open_article: await tools.open_article({ slug: "gpt-launch" }),
      read_open_article: await tools.read_open_article({}),
      save_article: await tools.save_article({ slug: "gpt-launch" }),
    };
    for (const [name, result] of Object.entries(results)) {
      const spec = pageSpecs.find((candidate) => candidate.name === name)!;
      expect(() => spec.output.parse(result), name).not.toThrow();
    }
    // The filters the results page cannot show are named in the result, and the schema allows both.
    const filtered = await tools.search_articles({ query: "agenti", entity: "openai", claimStatus: "rumour" });
    const search = pageSpecs.find((candidate) => candidate.name === "search_articles")!;
    expect(search.output.parse(filtered)).toMatchObject({ notShownOnPage: ["entity", "claimStatus"] });
  });
});

describe("parseArticleAttributes", () => {
  it("reads the id and slug of the story page, and nothing from other markup", () => {
    expect(parseArticleAttributes(articleHtml("gpt-launch"))).toEqual({ id: "id-gpt-launch", slug: "gpt-launch" });
    expect(parseArticleAttributes('<article class="row"><a href="/x">x</a></article>')).toBeNull();
  });
});

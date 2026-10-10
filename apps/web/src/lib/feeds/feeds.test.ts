import { describe, expect, it } from "vitest";
import type { Article } from "@atlasnews/core/editorial/domain/article";
import { buildJsonFeed } from "./json-feed";
import { buildNewsSitemap } from "./news-sitemap";
import { renderEntityMarkdown } from "./entity-markdown";
import { buildRssFeed } from "./rss";
import { storyUrl } from "./site";

function story(overrides: Partial<Article> = {}): Article {
  return {
    id: "a1",
    translationKey: "t1",
    locale: "en",
    slug: "agents-at-work",
    title: "Agents & \"tools\" <today>",
    excerpt: "Excerpt with <b>markup</b> & more.",
    content: "Body with **bold** & a [link](https://example.com/a?b=1&c=2).",
    coverImage: "",
    coverAlt: "",
    status: "published",
    category: { id: "c1", translationKey: "c", locale: "en", slug: "business", name: "Business", description: "" },
    author: { id: "u1", name: "Ada \"Editor\"", role: "Editor", initials: "AE" },
    featured: false,
    readingMinutes: 2,
    publishedAt: "2026-10-01T08:00:00.000Z",
    scheduledFor: null,
    createdAt: "2026-09-30T08:00:00.000Z",
    updatedAt: "2026-10-02T08:00:00.000Z",
    distribution: [],
    claimStatus: "rumour",
    keyPoints: [],
    sources: [],
    entities: [{ kind: "company", slug: "openai", name: "OpenAI", isPrimary: true }],
    ...overrides,
  };
}

const channel = {
  title: "Site & Co",
  description: "Desc",
  locale: "en" as const,
  homeUrl: "https://news.test/en",
  feedUrl: "https://news.test/en/feed.xml",
};

const draft = story({
  id: "draft",
  slug: "unpublished-draft",
  title: "Unpublished draft headline",
  status: "draft",
  publishedAt: null,
});

describe("RSS feed", () => {
  it("escapes channel and item text and writes the full body as content:encoded", () => {
    const xml = buildRssFeed({ ...channel, articles: [story()] });

    expect(xml).toContain("<title>Site &amp; Co</title>");
    expect(xml).toContain("<title>Agents &amp; &quot;tools&quot; &lt;today&gt;</title>");
    expect(xml).toContain("<description>Excerpt with &lt;b&gt;markup&lt;/b&gt; &amp; more.</description>");
    expect(xml).toContain("<content:encoded>");
    expect(xml).toContain("&lt;strong&gt;bold&lt;/strong&gt;");
    expect(xml).toContain("xmlns:content=\"http://purl.org/rss/1.0/modules/content/\"");
  });

  it("writes one category per entity and the claim status, plus the section", () => {
    const xml = buildRssFeed({ ...channel, articles: [story()] });

    expect(xml).toContain("<category>Business</category>");
    expect(xml).toContain("<category>OpenAI</category>");
    expect(xml).toContain("<category>Rumour</category>");
  });

  it("keeps the body HTML without the e-mail inline styles", () => {
    const xml = buildRssFeed({ ...channel, articles: [story()] });

    expect(xml).toContain("&lt;p&gt;Body with &lt;strong&gt;bold&lt;/strong&gt;");
    expect(xml).not.toContain("style=");
  });

  it("drops raw HTML from the body instead of passing it through", () => {
    const xml = buildRssFeed({
      ...channel,
      articles: [story({ content: "Safe text <script>alert(1)</script> after." })],
    });

    expect(xml).not.toContain("&lt;script");
    expect(xml).toContain("Safe text");
  });

  it("never writes a story that is not published", () => {
    const xml = buildRssFeed({ ...channel, articles: [story(), draft] });

    expect(xml).not.toContain("Unpublished draft headline");
    expect(xml).toContain(storyUrl("en", "agents-at-work"));
  });
});

describe("JSON feed", () => {
  it("declares JSON Feed 1.1 and parses back to the exact strings", () => {
    const feed = JSON.parse(buildJsonFeed({ ...channel, articles: [story()] }));

    expect(feed.version).toBe("https://jsonfeed.org/version/1.1");
    expect(feed.title).toBe("Site & Co");
    expect(feed.items).toHaveLength(1);
    expect(feed.items[0]).toMatchObject({
      id: storyUrl("en", "agents-at-work"),
      url: storyUrl("en", "agents-at-work"),
      title: "Agents & \"tools\" <today>",
      summary: "Excerpt with <b>markup</b> & more.",
      content_text: "Body with **bold** & a [link](https://example.com/a?b=1&c=2).",
      date_published: "2026-10-01T08:00:00.000Z",
      date_modified: "2026-10-02T08:00:00.000Z",
      language: "en",
      tags: ["OpenAI", "Rumour"],
      authors: [{ name: "Ada \"Editor\"" }],
    });
  });

  it("never lists a story that is not published", () => {
    const feed = JSON.parse(buildJsonFeed({ ...channel, articles: [draft] }));

    expect(feed.items).toEqual([]);
  });
});

describe("news sitemap", () => {
  it("declares the Google News namespace and escapes publication and title text", () => {
    const xml = buildNewsSitemap("AtlasNews & Co", [{
      url: storyUrl("it", "ai-agenti"),
      locale: "it",
      publishedAt: "2026-10-01T08:00:00.000Z",
      title: "Titolo <a> & \"b\"",
    }]);

    expect(xml).toContain("xmlns:news=\"http://www.google.com/schemas/sitemap-news/0.9\"");
    expect(xml).toContain("<news:name>AtlasNews &amp; Co</news:name>");
    expect(xml).toContain("<news:language>it</news:language>");
    expect(xml).toContain("<news:publication_date>2026-10-01T08:00:00.000Z</news:publication_date>");
    expect(xml).toContain("<news:title>Titolo &lt;a&gt; &amp; &quot;b&quot;</news:title>");
  });
});

describe("entity Markdown", () => {
  it("writes the identity and the story timeline with status and links", () => {
    const markdown = renderEntityMarkdown(
      {
        id: "e1",
        kind: "model",
        slug: "gpt",
        name: "GPT",
        officialUrl: "https://openai.com",
        parent: { slug: "openai", name: "OpenAI" },
        description: "A model family.",
      },
      [
        { slug: "first", title: "First [story]", claimStatus: "rumour", publishedAt: "2026-09-01T08:00:00.000Z" },
        { slug: "second", title: "Second", claimStatus: "confirmed", publishedAt: "2026-10-01T08:00:00.000Z" },
      ],
      { page: "https://news.test/en/entities/gpt", story: (slug) => `https://news.test/en/articles/${slug}` },
      "en",
    );

    expect(markdown).toContain("# GPT\n\n- URL: https://news.test/en/entities/gpt\n- Kind: Model\n- Parent: OpenAI\n- Official URL: https://openai.com\n- Stories: 2");
    expect(markdown).toContain("A model family.");
    expect(markdown).toContain("- 2026-09-01T08:00:00.000Z · Rumour · [First \\[story\\]](https://news.test/en/articles/first)");
    expect(markdown.indexOf("First")).toBeLessThan(markdown.indexOf("Second"));
  });
});

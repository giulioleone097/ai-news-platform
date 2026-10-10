import { describe, expect, it } from "vitest";

import { parseDeepLink, renderMarkdown } from "./widget-helpers";

const locales = ["en", "it"] as const;

describe("newsroom widget Markdown", () => {
  it("escapes raw HTML before applying Markdown", () => {
    const html = renderMarkdown('<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">');

    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders the editorial subset: headings, lists, quotes, code and links", () => {
    const html = renderMarkdown([
      "## Why it matters",
      "",
      "A **bold** claim with `code` and a [source](https://example.com/a?b=1&c=2).",
      "",
      "- first",
      "- second",
      "",
      "1. one",
      "",
      "> quoted",
      "",
      "```",
      "<b>raw</b>",
      "```",
      "",
      "---",
    ].join("\n"));

    expect(html).toContain("<h3>Why it matters</h3>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<code>code</code>");
    expect(html).toContain('<a href="https://example.com/a?b=1&amp;c=2" data-action="external">source</a>');
    expect(html).toContain("<ul><li>first</li><li>second</li></ul>");
    expect(html).toContain("<ol><li>one</li></ol>");
    expect(html).toContain("<blockquote><p>quoted</p></blockquote>");
    expect(html).toContain("<pre><code>&lt;b&gt;raw&lt;/b&gt;</code></pre>");
    expect(html).toContain("<hr>");
  });

  it("never links non-HTTP schemes", () => {
    expect(renderMarkdown("[x](javascript:alert(1))")).not.toContain("<a ");
  });
});

describe("newsroom deep links", () => {
  it("routes articles, categories and searches", () => {
    expect(parseDeepLink("/articles/it/agenti-ai", locales)).toEqual({ view: "article", locale: "it", slug: "agenti-ai" });
    expect(parseDeepLink("/categories/en/research", locales)).toEqual({ view: "feed", locale: "en", category: "research" });
    expect(parseDeepLink("/search?q=agents&locale=it", locales)).toEqual({ view: "search", locale: "it", query: "agents" });
  });

  it("falls back to the feed for unknown or unsafe paths", () => {
    expect(parseDeepLink("/", locales)).toEqual({ view: "feed", locale: undefined });
    expect(parseDeepLink("/articles/fr/x", locales)).toEqual({ view: "feed", locale: undefined });
    expect(parseDeepLink("/articles/en/../../etc", locales)).toEqual({ view: "feed", locale: undefined });
    expect(parseDeepLink("/search?q=a", locales)).toEqual({ view: "feed", locale: undefined });
  });
});

import { describe, expect, it } from "vitest";
import type { Article } from "../domain/article";
import { renderStoryMarkdown, type StoryMarkdownLabels } from "./story-markdown";

const labels: StoryMarkdownLabels = {
  claimStatus: { confirmed: "Confirmed", rollout: "Rolling out", test: "In test", rumour: "Rumour", analysis: "Analysis" },
  entityKind: { company: "Company", model: "Model", product: "Product" },
  keyPoints: "Key points",
  sources: "Sources",
};

function story(overrides: Partial<Article> = {}): Article {
  return {
    id: "a1",
    translationKey: "t1",
    locale: "en",
    slug: "agents-at-work",
    title: "Agents enter [everyday] work",
    excerpt: "A short\nexcerpt.",
    content: "## Body\n\nThe **body** text.",
    coverImage: "",
    coverAlt: "",
    status: "published",
    category: { id: "c1", translationKey: "c", locale: "en", slug: "business", name: "Business", description: "" },
    author: { id: "u1", name: "Ada Editor", role: "Editor", initials: "AE" },
    featured: false,
    readingMinutes: 2,
    publishedAt: "2026-10-01T08:00:00.000Z",
    scheduledFor: null,
    createdAt: "2026-09-30T08:00:00.000Z",
    updatedAt: "2026-10-02T08:00:00.000Z",
    distribution: [],
    claimStatus: "confirmed",
    keyPoints: ["First point", "Second point", "Third point"],
    sources: [{ title: "Release (notes)", url: "https://example.com/a(b)", supports: "The launch date." }],
    entities: [
      { kind: "company", slug: "openai", name: "OpenAI", isPrimary: true },
      { kind: "model", slug: "gpt", name: "GPT", isPrimary: false },
    ],
    ...overrides,
  };
}

describe("renderStoryMarkdown", () => {
  it("renders the title, metadata, excerpt, key points, body and sources in that order", () => {
    const markdown = renderStoryMarkdown(story(), "https://news.test/en/articles/agents-at-work", labels);

    expect(markdown.split("\n")[0]).toBe("# Agents enter [everyday] work");
    expect(markdown).toContain([
      "- URL: https://news.test/en/articles/agents-at-work",
      "- Published: 2026-10-01T08:00:00.000Z",
      "- Updated: 2026-10-02T08:00:00.000Z",
      "- Language: en",
      "- Status: Confirmed",
      "- Entities: OpenAI (Company, primary); GPT (Model)",
      "- Author: Ada Editor",
    ].join("\n"));
    const order = ["A short excerpt.", "## Key points", "## Body", "## Sources"].map((part) => markdown.indexOf(part));
    expect(order.every((index) => index > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("writes each source as a link followed by what it supports, with the link parts escaped", () => {
    const markdown = renderStoryMarkdown(
      story({ sources: [{ title: "Release [notes]", url: "https://example.com/a(b)", supports: "The launch date." }] }),
      "https://news.test/x",
      labels,
    );

    expect(markdown).toContain("- [Release \\[notes\\]](https://example.com/a%28b%29): The launch date.");
  });

  it("omits the key points and sources sections when the story has none", () => {
    const markdown = renderStoryMarkdown(
      story({ keyPoints: [], sources: [], entities: [], publishedAt: null }),
      "https://news.test/x",
      labels,
    );

    expect(markdown).not.toContain("## Key points");
    expect(markdown).not.toContain("## Sources");
    expect(markdown).not.toContain("Entities:");
    expect(markdown).not.toContain("Published:");
  });

  it("collapses line breaks in stored values so they cannot start new Markdown blocks", () => {
    const markdown = renderStoryMarkdown(
      story({ title: "Line one\n# Injected", keyPoints: ["Point\n## Injected heading"] }),
      "https://news.test/x",
      labels,
    );

    expect(markdown.split("\n").filter((line) => line.startsWith("# "))).toEqual(["# Line one # Injected"]);
    expect(markdown).toContain("- Point ## Injected heading");
  });
});

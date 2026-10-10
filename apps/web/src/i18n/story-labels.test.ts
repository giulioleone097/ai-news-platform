import { describe, expect, it } from "vitest";
import { articleAsMarkdown } from "@atlasnews/contract";
import type { Article, ClaimStatus } from "@atlasnews/core/editorial/domain/article";
import { storyLabels } from "@atlasnews/core/editorial/application/story-labels";
import { claimStatuses } from "@atlasnews/core/editorial/domain/article";
import { locales } from "@atlasnews/core/locale";
import { getMessages } from "@/i18n";
import { storyTags } from "@/lib/feeds/stories";

function story(locale: "en" | "it", claimStatus: ClaimStatus): Article {
  return {
    id: "a1",
    translationKey: "t1",
    locale,
    slug: "agents-at-work",
    title: "Agents at work",
    excerpt: "Excerpt.",
    content: "Body.",
    coverImage: "",
    coverAlt: "",
    status: "published",
    category: { id: "c1", translationKey: "c", locale, slug: "business", name: "Business", description: "" },
    author: { id: "u1", name: "Ada", role: "Editor", initials: "AE" },
    featured: false,
    readingMinutes: 2,
    publishedAt: "2026-10-01T08:00:00.000Z",
    scheduledFor: null,
    createdAt: "2026-09-30T08:00:00.000Z",
    updatedAt: "2026-10-02T08:00:00.000Z",
    distribution: [],
    claimStatus,
    keyPoints: ["First point"],
    sources: [],
    entities: [{ kind: "model", slug: "gpt", name: "GPT", isPrimary: true }],
  };
}

describe("story labels have one owner", () => {
  it.each(locales)("%s: the catalog, the Markdown export and the feed tags read the same core labels", (locale) => {
    const labels = storyLabels[locale];
    expect(getMessages(locale).story).toEqual(labels);

    for (const claimStatus of claimStatuses) {
      const article = story(locale, claimStatus);
      const markdown = articleAsMarkdown(article, `https://news.test/${locale}/articles/agents-at-work`);
      expect(markdown).toContain(`- Status: ${labels.claimStatus[claimStatus]}`);
      expect(storyTags(article, getMessages(locale).story)).toEqual(storyTags(article, labels));
    }

    const article = story(locale, "confirmed");
    expect(articleAsMarkdown(article, "https://news.test/x")).toContain(
      `## ${labels.keyPoints}\n\n- First point`,
    );
    expect(articleAsMarkdown(article, "https://news.test/x")).toContain(
      `(${labels.entityKind.model}, primary)`,
    );
  });
});

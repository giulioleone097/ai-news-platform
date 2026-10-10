import type { Article } from "@atlasnews/core/editorial/domain/article";
import { storyLabels } from "@atlasnews/core/editorial/application/story-labels";
import { renderSafeNewsletterMarkdown } from "@atlasnews/core/newsletter/application/markdown";
import type { Locale } from "@/i18n";
import { escapeXml } from "./xml";
import { publishedStories, storyTags } from "./stories";
import { storyUrl } from "./site";

export interface RssChannel {
  title: string;
  description: string;
  locale: Locale;
  homeUrl: string;
  feedUrl: string;
  articles: Article[];
}

/**
 * The newsletter renderer writes e-mail inline styles, which would fight a reader's own styling,
 * so they are removed. Text quotes are escaped by the renderer, so only its own attributes match.
 */
function htmlBody(markdown: string) {
  return renderSafeNewsletterMarkdown(markdown).replace(/ style="[^"]*"/gu, "");
}

/** RSS 2.0 with the full body as HTML in content:encoded; unpublished stories are never written. */
export function buildRssFeed({ title, description, locale, homeUrl, feedUrl, articles }: RssChannel) {
  const stories = publishedStories(articles);
  const labels = storyLabels[locale];
  const items = stories.map((article) => {
    const url = storyUrl(article.locale, article.slug);
    const categories = [article.category.name, ...storyTags(article, labels)];
    return `    <item>
      <title>${escapeXml(article.title)}</title>
      <link>${escapeXml(url)}</link>
      <guid isPermaLink="true">${escapeXml(url)}</guid>
      <description>${escapeXml(article.excerpt)}</description>
      <content:encoded>${escapeXml(htmlBody(article.content))}</content:encoded>
      ${categories.map((category) => `<category>${escapeXml(category)}</category>`).join("\n      ")}
      <pubDate>${new Date(article.publishedAt).toUTCString()}</pubDate>
    </item>`;
  }).join("\n");
  const lastBuildDate = stories[0]
    ? new Date(stories[0].updatedAt).toUTCString()
    : new Date(0).toUTCString();

  return `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${escapeXml(title)}</title>
    <link>${escapeXml(homeUrl)}</link>
    <description>${escapeXml(description)}</description>
    <language>${locale}</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;
}

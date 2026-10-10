import type { Article } from "@atlasnews/core/editorial/domain/article";
import { storyLabels } from "@atlasnews/core/editorial/application/story-labels";
import type { Locale } from "@/i18n";
import { publishedStories, storyTags } from "./stories";
import { storyUrl } from "./site";

export interface JsonFeedChannel {
  title: string;
  description: string;
  locale: Locale;
  homeUrl: string;
  feedUrl: string;
  articles: Article[];
}

/** JSON Feed 1.1; content_text carries the Markdown body as the brief requires. */
export function buildJsonFeed({ title, description, locale, homeUrl, feedUrl, articles }: JsonFeedChannel) {
  const labels = storyLabels[locale];
  return JSON.stringify({
    version: "https://jsonfeed.org/version/1.1",
    title,
    description,
    language: locale,
    home_page_url: homeUrl,
    feed_url: feedUrl,
    items: publishedStories(articles).map((article) => {
      const url = storyUrl(article.locale, article.slug);
      return {
        id: url,
        url,
        title: article.title,
        summary: article.excerpt,
        content_text: article.content,
        date_published: article.publishedAt,
        date_modified: article.updatedAt,
        language: article.locale,
        tags: storyTags(article, labels),
        authors: [{ name: article.author.name }],
      };
    }),
  }, null, 2);
}

import type { Article } from "@atlasnews/core/editorial/domain/article";
import type { StoryMarkdownLabels } from "@atlasnews/core/editorial/application/story-markdown";

export type PublishedStory = Article & { publishedAt: string };

/** Only published stories with a publication date reach a feed or a sitemap, whatever the caller passes. */
export function publishedStories(articles: Article[]): PublishedStory[] {
  return articles.filter(
    (article): article is PublishedStory => article.status === "published" && article.publishedAt !== null,
  );
}

/** The entity names and the claim status of a story, as feed tags. */
export function storyTags(article: Article, labels: StoryMarkdownLabels) {
  return [...article.entities.map((entity) => entity.name), labels.claimStatus[article.claimStatus]];
}

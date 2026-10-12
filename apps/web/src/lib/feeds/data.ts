import "server-only";

import { unstable_cache } from "next/cache";
import type { Article, ArticleCursor } from "@atlasnews/core/editorial/domain/article";
import type { EntitySummary } from "@atlasnews/core/editorial/domain/entity";
import type { Locale } from "@/i18n";
import { articlesCacheTag } from "@/lib/editorial-cache";
import { searchPublishedArticles } from "@/lib/editorial-queries";
import { getPublicEditorialRepositories } from "@/server/composition";

/** The entity with its published stories, cached and invalidated with the article cache. */
export const getEntityPage = unstable_cache(
  async (slug: string, locale: Locale) => {
    const { entities } = getPublicEditorialRepositories();
    const [entity, timeline] = await Promise.all([
      entities.findEntityBySlug(slug, locale),
      entities.listEntityTimeline(slug, locale),
    ]);
    return entity ? { entity, timeline } : null;
  },
  ["atlasnews-entity-page-v1"],
  { revalidate: 300, tags: [articlesCacheTag] },
);

/** Entities that have at least one published story in the locale. */
export async function getCoveredEntities(locale: Locale): Promise<EntitySummary[]> {
  const entities = await getPublicEditorialRepositories().entities.listEntities(locale);
  return entities.filter((entity) => entity.storyCount > 0);
}

/** Every published story of a locale, newest first. The repositories answer 50 at most per call, so this follows the cursor. */
async function* publishedStories(locale: Locale): AsyncGenerator<Article> {
  let cursor: ArticleCursor | undefined;
  do {
    const page = await searchPublishedArticles({ locale, limit: 50, cursor });
    yield* page.items;
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
}

/** All the published stories of a locale, newest first. */
export async function getPublishedStories(locale: Locale): Promise<Article[]> {
  const stories: Article[] = [];
  for await (const story of publishedStories(locale)) stories.push(story);
  return stories;
}

/**
 * The slug of each published story of a locale, by translation key. Cached and invalidated with the article
 * cache: building it reads every story once per window, and it keeps one small entry per story, which is
 * fine for thousands of stories. Past that, a repository lookup by translation key replaces it.
 */
const getTranslationIndex = unstable_cache(
  async (locale: Locale) => {
    const slugs: Record<string, string> = {};
    for await (const story of publishedStories(locale)) slugs[story.translationKey] = story.slug;
    return slugs;
  },
  ["atlasnews-translation-index-v1"],
  { revalidate: 300, tags: [articlesCacheTag] },
);

/** The slug, in `locale`, of the published story that translates `translationKey`; undefined when there is none. */
export async function findTranslationSlug(translationKey: string, locale: Locale): Promise<string | undefined> {
  const slugs = await getTranslationIndex(locale);
  return Object.hasOwn(slugs, translationKey) ? slugs[translationKey] : undefined;
}

/** Published stories of a locale that are dated at or after `since`, newest first. */
export async function getStoriesPublishedSince(locale: Locale, since: Date): Promise<Article[]> {
  const stories: Article[] = [];
  for await (const article of publishedStories(locale)) {
    if (!article.publishedAt || Date.parse(article.publishedAt) < since.getTime()) break;
    stories.push(article);
  }
  return stories;
}

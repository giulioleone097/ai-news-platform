import { isLocale, locales } from "@atlasnews/core/locale";
import {
  decodeArticleCursor,
  encodeArticleCursor,
} from "@atlasnews/core/editorial/application/public-feed";
import { slugPattern } from "@atlasnews/core/editorial/domain/article";
import { decodeCommentCursor } from "@atlasnews/core/comments/domain/cursor";
import type { PublicCommentQuery } from "@atlasnews/core/comments/application/comment-repository";

import { CapabilityFailure, implement } from "../capability";
import type { PublicArticleReader, PublicCommentReader } from "../ports";
import {
  articleAsMarkdown,
  articlePath,
  toArticle,
  toArticleSummary,
  toCategory,
  toEntity,
} from "../presenters";
import {
  fetchArticle,
  getArticle,
  getEntityTimeline,
  listArticles,
  listCategories,
  listComments,
  search,
} from "../specs/public";
import { listEntities } from "../specs/entities";
import { searchArticles } from "../specs/search-articles";
import { markUntrusted } from "../untrusted";

/**
 * The newest published articles over every locale, newest first. Without `query` they are
 * simply the latest ones. The site search and the composer mentions both read through this.
 */
export async function searchPublishedAcrossLocales(
  reader: Pick<PublicArticleReader, "listPublished">,
  { query, perLocale, limit }: { query?: string; perLocale: number; limit: number },
) {
  const pages = await Promise.all(
    locales.map((locale) => reader.listPublished({ locale, limit: perLocale, ...(query ? { query } : {}) })),
  );
  return pages
    .flatMap((page) => page.items)
    .sort((left, right) =>
      (right.publishedAt ?? right.updatedAt).localeCompare(left.publishedAt ?? left.updatedAt))
    .slice(0, limit);
}

export async function listPublishedArticleComments(
  reader: Pick<PublicArticleReader, "findBySlug">,
  comments: PublicCommentReader,
  input: Omit<PublicCommentQuery, "articleId"> & { slug: string },
) {
  const article = await reader.findBySlug(input.slug, input.locale);
  if (!article || article.status !== "published") {
    throw new Error("Published article not found.");
  }
  return comments.listApproved({
    articleId: article.id,
    locale: input.locale,
    parentId: input.parentId,
    cursor: input.cursor,
    limit: input.limit,
  });
}


export const publicCapabilities = [
  implement(listArticles, async ({ articles }, { locale, category, entity, claimStatus, limit, cursor }) => {
    const page = await articles.listPublished({
      locale,
      category,
      entity,
      claimStatus,
      limit,
      cursor: (cursor ? decodeArticleCursor(cursor) : undefined) ?? undefined,
    });
    return { items: page.items.map(toArticleSummary), nextCursor: encodeArticleCursor(page.nextCursor) };
  }),

  implement(searchArticles, async ({ articles }, { locale, query, entity, claimStatus, limit }) => {
    const page = await articles.listPublished({ locale, query, entity, claimStatus, limit });
    return { items: page.items.map(toArticleSummary) };
  }),

  implement(listEntities, async ({ entities }, { locale, kind }) => ({
    items: (await entities.listEntities(locale, kind)).map((entity) => ({
      ...toEntity(entity),
      storyCount: entity.storyCount,
    })),
  })),

  implement(getEntityTimeline, async ({ entities, site }, { locale, slug }) => {
    const entity = await entities.findEntityBySlug(slug, locale);
    if (!entity) throw new CapabilityFailure(`Entity not found for locale "${locale}".`);
    const stories = await entities.listEntityTimeline(slug, locale);
    return {
      entity: toEntity(entity),
      stories: stories.map((story) => ({
        date: story.publishedAt,
        status: story.claimStatus,
        title: story.title,
        slug: story.slug,
        url: site.absolute(articlePath({ locale, slug: story.slug })),
      })),
    };
  }),

  implement(getArticle, async ({ articles }, { locale, slug }) => {
    const article = await articles.findBySlug(slug, locale);
    if (!article || article.status !== "published") {
      throw new CapabilityFailure(`Article not found for locale "${locale}".`);
    }
    return { article: toArticle(article) };
  }),

  implement(listCategories, async ({ articles }, { locale }) => ({
    categories: (await articles.listCategories(locale)).map(toCategory),
  })),

  implement(listComments, async (ports, { slug, locale, parentId, cursor, limit }) => {
    const decodedCursor = decodeCommentCursor(cursor);
    if (cursor && !decodedCursor) throw new Error("Invalid comment cursor.");
    const page = await listPublishedArticleComments(ports.articles, await ports.publicComments(), {
      slug,
      locale,
      parentId: parentId ?? null,
      cursor: decodedCursor,
      limit,
    });
    return markUntrusted(page, ["items[].body", "items[].displayName"]);
  }),

  implement(search, async ({ articles, site }, { query }) => {
    const found = await searchPublishedAcrossLocales(articles, { query, perLocale: 10, limit: 10 });
    const results = found.map((article) => ({
      id: `${article.locale}/${article.slug}`,
      title: article.title,
      url: site.absolute(articlePath(article)),
    }));
    return { results };
  }),

  implement(fetchArticle, async ({ articles, site }, { id }) => {
    const [locale, slug, ...rest] = id.split("/");
    if (!isLocale(locale) || !slug || rest.length || !slugPattern.test(slug)) {
      throw new CapabilityFailure("Unknown document id. Use an id returned by search.");
    }
    const article = await articles.findBySlug(slug, locale);
    if (!article || article.status !== "published") throw new CapabilityFailure("Document not found.");
    const url = site.absolute(articlePath(article));
    return {
      id,
      title: article.title,
      text: articleAsMarkdown(article, url),
      url,
      metadata: {
        locale: article.locale,
        claimStatus: article.claimStatus,
        category: article.category.name,
        author: article.author.name,
        publishedAt: article.publishedAt ?? article.updatedAt,
        updatedAt: article.updatedAt,
        readingMinutes: article.readingMinutes,
      },
    };
  }),
];

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
} from "../presenters";
import {
  fetchArticle,
  getArticle,
  listArticles,
  listCategories,
  listComments,
  search,
} from "../specs/public";
import { searchArticles } from "../specs/search-articles";

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
  implement(listArticles, async ({ articles }, { locale, category, limit, cursor }) => {
    const page = await articles.listPublished({
      locale,
      category,
      limit,
      cursor: (cursor ? decodeArticleCursor(cursor) : undefined) ?? undefined,
    });
    return { items: page.items.map(toArticleSummary), nextCursor: encodeArticleCursor(page.nextCursor) };
  }),

  implement(searchArticles, async ({ articles }, { locale, query, limit }) => {
    const page = await articles.listPublished({ locale, query, limit });
    return { items: page.items.map(toArticleSummary) };
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
    return listPublishedArticleComments(ports.articles, await ports.publicComments(), {
      slug,
      locale,
      parentId: parentId ?? null,
      cursor: decodedCursor,
      limit,
    });
  }),

  implement(search, async ({ articles, site }, { query }) => {
    const pages = await Promise.all(
      locales.map((locale) => articles.listPublished({ locale, query, limit: 10 })),
    );
    const results = pages
      .flatMap((page) => page.items)
      .sort((left, right) =>
        (right.publishedAt ?? right.updatedAt).localeCompare(left.publishedAt ?? left.updatedAt))
      .slice(0, 10)
      .map((article) => ({
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
        category: article.category.name,
        author: article.author.name,
        publishedAt: article.publishedAt ?? article.updatedAt,
        updatedAt: article.updatedAt,
        readingMinutes: article.readingMinutes,
      },
    };
  }),
];

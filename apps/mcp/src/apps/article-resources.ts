import {
  ResourceNotFoundError,
  ResourceTemplate,
  type McpServer,
} from "@modelcontextprotocol/server";

import { isLocale, locales } from "@atlasnews/core/locale";
import { slugPattern, type Article } from "@atlasnews/core/editorial/domain/article";
import type { ArticleRepository } from "@atlasnews/core/editorial/domain/article-repository";

import { articleAsMarkdown, articlePath } from "@atlasnews/contract";

type ArticleResourceReader = Pick<ArticleRepository, "listPublished" | "findBySlug">;

export const articleResourceTemplate = "atlasnews://articles/{locale}/{slug}";

export function articleResourceUri(article: Pick<Article, "locale" | "slug">) {
  return `atlasnews://articles/${article.locale}/${article.slug}`;
}

export function articleResource(article: Article) {
  return {
    uri: articleResourceUri(article),
    name: article.slug,
    title: article.title,
    description: article.excerpt,
    mimeType: "text/markdown",
  };
}

export function articleResourceLink(article: Article) {
  return { type: "resource_link" as const, ...articleResource(article) };
}

/**
 * Exposes published articles as MCP resources, so composer mentions and other
 * resource links resolve to the article text instead of a bare URL.
 */
export function registerArticleResources(
  server: McpServer,
  reader: ArticleResourceReader,
  siteUrl: URL,
) {
  server.registerResource(
    "atlasnews-article",
    new ResourceTemplate(articleResourceTemplate, {
      list: async () => {
        const pages = await Promise.all(
          locales.map((locale) => reader.listPublished({ locale, limit: 10 })),
        );
        return { resources: pages.flatMap((page) => page.items.map(articleResource)) };
      },
    }),
    {
      title: "AtlasNews article",
      description: "A published AtlasNews AI news article as Markdown, by locale and slug.",
      mimeType: "text/markdown",
    },
    async (uri, variables) => {
      const locale = variables.locale;
      const slug = variables.slug;
      if (!isLocale(locale) || typeof slug !== "string" || !slugPattern.test(slug)) {
        throw new ResourceNotFoundError(uri.href);
      }
      const article = await reader.findBySlug(slug, locale);
      if (!article || article.status !== "published") throw new ResourceNotFoundError(uri.href);
      return {
        contents: [
          {
            uri: articleResourceUri(article),
            mimeType: "text/markdown",
            text: articleAsMarkdown(article, new URL(articlePath(article), siteUrl).href),
          },
        ],
      };
    },
  );
}

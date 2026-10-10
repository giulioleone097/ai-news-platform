import {
  ResourceNotFoundError,
  ResourceTemplate,
  type McpServer,
} from "@modelcontextprotocol/server";

import { isLocale, locales } from "@/i18n";
import type { Article } from "@/modules/editorial/domain/article";
import type { ArticleRepository } from "@/modules/editorial/domain/article-repository";

import { articlePath, slugPattern } from "../public-presenters";

type ArticleResourceReader = Pick<ArticleRepository, "listPublished" | "findBySlug">;

export const articleResourceTemplate = "neura://articles/{locale}/{slug}";

export function articleResourceUri(article: Pick<Article, "locale" | "slug">) {
  return `neura://articles/${article.locale}/${article.slug}`;
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

export function articleAsMarkdown(article: Article, siteUrl: URL) {
  const url = new URL(articlePath(article), siteUrl).href;
  return [
    `# ${article.title}`,
    "",
    `${article.category.name} · ${article.publishedAt ?? article.updatedAt} · ${article.readingMinutes} min · ${article.author.name}`,
    `Source: ${url}`,
    "",
    `> ${article.excerpt}`,
    "",
    article.content,
  ].join("\n");
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
    "neura-article",
    new ResourceTemplate(articleResourceTemplate, {
      list: async () => {
        const pages = await Promise.all(
          locales.map((locale) => reader.listPublished({ locale, limit: 10 })),
        );
        return { resources: pages.flatMap((page) => page.items.map(articleResource)) };
      },
    }),
    {
      title: "NEURA article",
      description: "A published NEURA AI news article as Markdown, by locale and slug.",
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
            text: articleAsMarkdown(article, siteUrl),
          },
        ],
      };
    },
  );
}

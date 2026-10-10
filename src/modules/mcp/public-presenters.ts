import type { CallToolResult } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import { defaultLocale, locales } from "@/i18n";
import { slugPattern, type Article, type Category } from "@/modules/editorial/domain/article";
import { decodeArticleCursor } from "@/modules/editorial/application/public-feed";

export const localeSchema = z
  .enum(locales)
  .default(defaultLocale)
  .describe("Content locale. Defaults to English (en).");

export const categorySlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(slugPattern)
  .describe("Locale-specific category slug.");

export const articleSlugSchema = z.string().trim().min(1).max(160).regex(slugPattern);

export const encodedCursorSchema = z
  .string()
  .min(1)
  .max(512)
  .refine((value) => decodeArticleCursor(value) !== null, "Invalid article cursor.")
  .describe("Opaque cursor returned by a previous list_articles call.");

export const categoryOutputSchema = z.object({
  slug: z.string(),
  name: z.string(),
  description: z.string(),
});

export const articleSummaryOutputSchema = z.object({
  locale: z.enum(locales),
  slug: z.string(),
  title: z.string(),
  excerpt: z.string(),
  category: z.object({ slug: z.string(), name: z.string() }),
  publishedAt: z.string(),
  readingMinutes: z.number().int().positive(),
  path: z.string(),
});

export const articleOutputSchema = articleSummaryOutputSchema.extend({
  content: z.string(),
  coverImage: z.string(),
  coverAlt: z.string(),
  author: z.object({ name: z.string(), role: z.string() }),
  updatedAt: z.string(),
});

export const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

export function articlePath(article: Pick<Article, "locale" | "slug">) {
  return `/${article.locale}/articles/${article.slug}`;
}

export function toArticleSummary(article: Article) {
  return {
    locale: article.locale,
    slug: article.slug,
    title: article.title,
    excerpt: article.excerpt,
    category: {
      slug: article.category.slug,
      name: article.category.name,
    },
    publishedAt: article.publishedAt ?? article.updatedAt,
    readingMinutes: article.readingMinutes,
    path: articlePath(article),
  };
}

export function toArticle(article: Article) {
  return {
    ...toArticleSummary(article),
    content: article.content,
    coverImage: article.coverImage,
    coverAlt: article.coverAlt,
    author: { name: article.author.name, role: article.author.role },
    updatedAt: article.updatedAt,
  };
}

export function toCategory(category: Category) {
  return {
    slug: category.slug,
    name: category.name,
    description: category.description,
  };
}

export function success(payload: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    structuredContent: payload,
  };
}

export function failure(message: string): CallToolResult {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

export const sourceUnavailableMessage = "The editorial source is temporarily unavailable.";

export async function safely(
  operation: () => Promise<Record<string, unknown>>,
): Promise<CallToolResult> {
  try {
    return success(await operation());
  } catch {
    return failure(sourceUnavailableMessage);
  }
}

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import * as z from "zod/v4";

import type {
  Article,
  Category,
} from "@/modules/editorial/domain/article";
import type { ArticleRepository } from "@/modules/editorial/domain/article-repository";
import {
  decodeArticleCursor,
  encodeArticleCursor,
} from "@/modules/editorial/application/public-feed";
import { defaultLocale, locales } from "@/i18n";

export type PublicEditorialReader = Pick<
  ArticleRepository,
  "listPublished" | "findBySlug" | "listCategories"
>;

const localeSchema = z
  .enum(locales)
  .default(defaultLocale)
  .describe("Content locale. Defaults to English (en).");

const categorySlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .describe("Locale-specific category slug.");

const encodedCursorSchema = z
  .string()
  .min(1)
  .max(512)
  .refine((value) => decodeArticleCursor(value) !== null, "Invalid article cursor.")
  .describe("Opaque cursor returned by a previous list_articles call.");

const categoryOutputSchema = z.object({
  slug: z.string(),
  name: z.string(),
  description: z.string(),
});

const articleSummaryOutputSchema = z.object({
  locale: z.enum(locales),
  slug: z.string(),
  title: z.string(),
  excerpt: z.string(),
  category: z.object({ slug: z.string(), name: z.string() }),
  publishedAt: z.string(),
  readingMinutes: z.number().int().positive(),
  path: z.string(),
});

const articleOutputSchema = articleSummaryOutputSchema.extend({
  content: z.string(),
  coverImage: z.string(),
  coverAlt: z.string(),
  author: z.object({ name: z.string(), role: z.string() }),
  updatedAt: z.string(),
});

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

function toArticleSummary(article: Article) {
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
    path: `/${article.locale}/articles/${article.slug}`,
  };
}

function toArticle(article: Article) {
  return {
    ...toArticleSummary(article),
    content: article.content,
    coverImage: article.coverImage,
    coverAlt: article.coverAlt,
    author: { name: article.author.name, role: article.author.role },
    updatedAt: article.updatedAt,
  };
}

function toCategory(category: Category) {
  return {
    slug: category.slug,
    name: category.name,
    description: category.description,
  };
}

function success(payload: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    structuredContent: payload,
  };
}

function failure(message: string): CallToolResult {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

async function safely(
  operation: () => Promise<Record<string, unknown>>,
): Promise<CallToolResult> {
  try {
    return success(await operation());
  } catch {
    return failure("The editorial source is temporarily unavailable.");
  }
}

export function createPublicMcpServer(reader: PublicEditorialReader) {
  const server = new McpServer({
    name: "neura-ai-news",
    version: "1.0.0",
  });

  server.registerTool(
    "list_articles",
    {
      title: "List published AI news",
      description:
        "List published NEURA articles in English or Italian with cursor pagination. English is the default.",
      inputSchema: {
        locale: localeSchema,
        category: categorySlugSchema.optional(),
        limit: z.number().int().min(1).max(25).default(10),
        cursor: encodedCursorSchema.optional(),
      },
      outputSchema: {
        items: z.array(articleSummaryOutputSchema),
        nextCursor: z.string().nullable(),
      },
      annotations: readOnlyAnnotations,
    },
    async ({ locale, category, limit, cursor }) =>
      safely(async () => {
        const decodedCursor = cursor ? decodeArticleCursor(cursor) : undefined;
        const page = await reader.listPublished({
          locale,
          category,
          limit,
          cursor: decodedCursor ?? undefined,
        });

        return {
          items: page.items.map(toArticleSummary),
          nextCursor: encodeArticleCursor(page.nextCursor),
        };
      }),
  );

  server.registerTool(
    "search_articles",
    {
      title: "Search published AI news",
      description:
        "Search published NEURA articles by title, excerpt, body and category in English or Italian.",
      inputSchema: {
        locale: localeSchema,
        query: z.string().trim().min(2).max(160),
        limit: z.number().int().min(1).max(25).default(10),
      },
      outputSchema: {
        items: z.array(articleSummaryOutputSchema),
      },
      annotations: readOnlyAnnotations,
    },
    async ({ locale, query, limit }) =>
      safely(async () => {
        const page = await reader.listPublished({ locale, query, limit });
        return { items: page.items.map(toArticleSummary) };
      }),
  );

  server.registerTool(
    "get_article",
    {
      title: "Get a published AI news article",
      description:
        "Get the complete body and public metadata for one published NEURA article.",
      inputSchema: {
        locale: localeSchema,
        slug: z
          .string()
          .trim()
          .min(1)
          .max(160)
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
      },
      outputSchema: { article: articleOutputSchema },
      annotations: readOnlyAnnotations,
    },
    async ({ locale, slug }) => {
      try {
        const article = await reader.findBySlug(slug, locale);
        if (!article || article.status !== "published") {
          return failure(`Article not found for locale "${locale}".`);
        }
        return success({ article: toArticle(article) });
      } catch {
        return failure("The editorial source is temporarily unavailable.");
      }
    },
  );

  server.registerTool(
    "list_categories",
    {
      title: "List AI news categories",
      description:
        "List the available NEURA editorial categories in English or Italian.",
      inputSchema: { locale: localeSchema },
      outputSchema: { categories: z.array(categoryOutputSchema) },
      annotations: readOnlyAnnotations,
    },
    async ({ locale }) =>
      safely(async () => {
        const categories = await reader.listCategories(locale);
        return { categories: categories.map(toCategory) };
      }),
  );

  return server;
}

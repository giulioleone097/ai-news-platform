import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import { getPublicSiteUrl, getSupabaseEnvironment } from "@atlasnews/adapters/config/env";
import { locales } from "@atlasnews/core/locale";
import type { ArticleRepository } from "@atlasnews/core/editorial/domain/article-repository";
import {
  decodeArticleCursor,
  encodeArticleCursor,
} from "@atlasnews/core/editorial/application/public-feed";
import { decodeCommentCursor } from "@atlasnews/core/comments/domain/cursor";
import type {
  PublicCommentPage,
} from "@atlasnews/core/comments/domain/comment";
import type {
  PublicCommentQuery,
} from "@atlasnews/core/comments/application/comment-repository";

import type { McpEventsService } from "@atlasnews/core/mcp-events/application/mcp-events-service";
import { createMcpEventsService } from "@atlasnews/adapters/mcp-events/lazy-service";
import { registerMcpEvents } from "./events/register";

import { registerMcpApps, type McpAppsOptions } from "./apps";
import { newsroomToolMeta } from "./apps/ui-resource";
import { publicMcpServerVersion } from "./metadata";
import {
  articleOutputSchema,
  articleSlugSchema,
  articleSummaryOutputSchema,
  categoryOutputSchema,
  categorySlugSchema,
  encodedCursorSchema,
  failure,
  localeSchema,
  readOnlyAnnotations,
  safely,
  sourceUnavailableMessage,
  success,
  toArticle,
  toArticleSummary,
  toCategory,
} from "./public-presenters";

const publicCommentOutputSchema = z.object({
  id: z.string().uuid(),
  articleId: z.string().uuid(),
  locale: z.enum(locales),
  parentId: z.string().uuid().nullable(),
  body: z.string(),
  displayName: z.string(),
  createdAt: z.string(),
  editedAt: z.string().nullable(),
  replyCount: z.number().int().nonnegative(),
});

export type PublicEditorialReader = Pick<
  ArticleRepository,
  "listPublished" | "findBySlug" | "listCategories"
>;

export interface PublicCommentReader {
  listApproved(query: PublicCommentQuery): Promise<PublicCommentPage>;
}

export async function listPublishedArticleComments(
  reader: PublicEditorialReader,
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

export function defaultMcpAppsOptions(): McpAppsOptions {
  const supabase = getSupabaseEnvironment();
  return {
    siteUrl: getPublicSiteUrl(),
    assetOrigins: supabase ? [new URL(supabase.url).origin] : [],
    version: publicMcpServerVersion,
  };
}

export function createPublicMcpServer(
  reader: PublicEditorialReader,
  options: McpAppsOptions = defaultMcpAppsOptions(),
  events: McpEventsService | null = createMcpEventsService(),
) {
  const icon = {
    src: new URL("/mcp/neura-icon.svg", options.siteUrl).href,
    mimeType: "image/svg+xml",
    sizes: ["any"],
  };
  const server = new McpServer({
    name: "neura-ai-news",
    title: "NEURA AI News",
    version: publicMcpServerVersion,
    websiteUrl: options.siteUrl.origin,
    icons: [icon],
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
      _meta: newsroomToolMeta(),
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
      _meta: newsroomToolMeta(),
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
        slug: articleSlugSchema,
      },
      outputSchema: { article: articleOutputSchema },
      annotations: readOnlyAnnotations,
      _meta: newsroomToolMeta(),
    },
    async ({ locale, slug }) => {
      try {
        const article = await reader.findBySlug(slug, locale);
        if (!article || article.status !== "published") {
          return failure(`Article not found for locale "${locale}".`);
        }
        return success({ article: toArticle(article) });
      } catch {
        return failure(sourceUnavailableMessage);
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

  server.registerTool(
    "list_comments",
    {
      title: "List approved article comments",
      description:
        "List approved top-level comments or replies for a published article with keyset pagination.",
      inputSchema: {
        slug: articleSlugSchema,
        locale: localeSchema,
        parentId: z.string().uuid().nullable().optional(),
        cursor: z.string().trim().min(1).max(512).optional(),
        limit: z.number().int().min(1).max(24).default(12),
      },
      outputSchema: {
        items: z.array(publicCommentOutputSchema),
        nextCursor: z.string().nullable(),
      },
      annotations: readOnlyAnnotations,
    },
    async ({ slug, locale, parentId, cursor, limit }) =>
      safely(async () => {
        const decodedCursor = decodeCommentCursor(cursor);
        if (cursor && !decodedCursor) throw new Error("Invalid comment cursor.");
        const { createPublicCommentService } = await import(
          "@atlasnews/adapters/comments/container"
        );
        const service = createPublicCommentService();
        if (!service) throw new Error("Comments are not configured.");
        return listPublishedArticleComments(reader, service, {
          slug,
          locale,
          parentId: parentId ?? null,
          cursor: decodedCursor,
          limit,
        });
      }),
  );

  registerMcpApps(server, reader, options, [icon]);
  registerMcpEvents(server, { service: events });

  return server;
}

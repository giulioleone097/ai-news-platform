import { McpServer, type CallToolResult } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import { locales } from "@/i18n";
import {
  articleStatuses,
  socialChannels,
  type Article,
  type ArticleDraftInput,
} from "@/modules/editorial/domain/article";
import type { ArticleRepository } from "@/modules/editorial/domain/article-repository";

const localeSchema = z.enum(locales);
const statusSchema = z.enum(articleStatuses);
const channelSchema = z.enum(socialChannels);
const idSchema = z.string().uuid();
const slugSchema = z.string().trim().min(1).max(96).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const articleFields = {
  locale: localeSchema,
  title: z.string().trim().min(4).max(180),
  slug: slugSchema.optional(),
  excerpt: z.string().trim().min(20).max(420),
  content: z.string().trim().min(80).max(120_000),
  categorySlug: slugSchema,
  status: statusSchema,
  featured: z.boolean().optional(),
  coverImage: z.string().trim().min(1).max(2_048).optional(),
  coverAlt: z.string().trim().min(3).max(240).optional(),
  scheduledFor: z.string().datetime().nullable().optional(),
  distribution: z.array(channelSchema).max(socialChannels.length).optional(),
} as const;

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;
const write = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
} as const;
const destructive = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true,
} as const;

function articlePayload(article: Article) {
  return {
    id: article.id,
    translationKey: article.translationKey,
    locale: article.locale,
    slug: article.slug,
    title: article.title,
    excerpt: article.excerpt,
    content: article.content,
    category: { slug: article.category.slug, name: article.category.name },
    status: article.status,
    featured: article.featured,
    coverImage: article.coverImage,
    coverAlt: article.coverAlt,
    publishedAt: article.publishedAt,
    scheduledFor: article.scheduledFor,
    updatedAt: article.updatedAt,
    distribution: article.distribution,
  };
}

function success(payload: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    structuredContent: payload,
  };
}

function failure(message: string): CallToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

function toDraft(article: Article): ArticleDraftInput {
  return {
    id: article.id,
    translationKey: article.translationKey,
    locale: article.locale,
    title: article.title,
    slug: article.slug,
    excerpt: article.excerpt,
    content: article.content,
    categorySlug: article.category.slug,
    status: article.status,
    featured: article.featured,
    coverImage: article.coverImage,
    coverAlt: article.coverAlt,
    scheduledFor: article.scheduledFor,
    distribution: article.distribution,
  };
}

async function safe(operation: () => Promise<CallToolResult>) {
  try {
    return await operation();
  } catch {
    return failure("The editorial operation could not be completed.");
  }
}

export function createAdminMcpServer(repository: ArticleRepository) {
  const server = new McpServer({ name: "neura-ai-news-admin", version: "1.0.0" });

  server.registerTool("admin_list_articles", {
    title: "List newsroom articles",
    description: "List all NEURA newsroom articles, including drafts, for one locale.",
    inputSchema: { locale: localeSchema },
    annotations: readOnly,
  }, async ({ locale }) => safe(async () => success({
    items: (await repository.listForStudio(locale)).map(articlePayload),
  })));

  server.registerTool("admin_get_article", {
    title: "Get newsroom article",
    description: "Get a complete newsroom article by ID and locale.",
    inputSchema: { id: idSchema, locale: localeSchema },
    annotations: readOnly,
  }, async ({ id, locale }) => safe(async () => {
    const article = await repository.findById(id, locale);
    return article ? success({ article: articlePayload(article) }) : failure("Article not found.");
  }));

  server.registerTool("admin_list_categories", {
    title: "List newsroom categories",
    description: "List valid editorial categories for one locale.",
    inputSchema: { locale: localeSchema },
    annotations: readOnly,
  }, async ({ locale }) => safe(async () => success({
    categories: await repository.listCategories(locale),
  })));

  server.registerTool("admin_create_article", {
    title: "Create newsroom article",
    description: "Create an editorial article. Draft is the safest default status.",
    inputSchema: { ...articleFields, status: statusSchema.default("draft") },
    annotations: write,
  }, async (input) => safe(async () => {
    if (input.status === "scheduled" && !input.scheduledFor) return failure("scheduledFor is required for scheduled articles.");
    const article = await repository.save(input);
    return success({ article: articlePayload(article) });
  }));

  server.registerTool("admin_update_article", {
    title: "Update newsroom article",
    description: "Update selected fields of an existing editorial article.",
    inputSchema: {
      id: idSchema,
      locale: localeSchema,
      title: articleFields.title.optional(),
      slug: articleFields.slug,
      excerpt: articleFields.excerpt.optional(),
      content: articleFields.content.optional(),
      categorySlug: articleFields.categorySlug.optional(),
      status: statusSchema.optional(),
      featured: articleFields.featured,
      coverImage: articleFields.coverImage,
      coverAlt: articleFields.coverAlt,
      scheduledFor: articleFields.scheduledFor,
      distribution: articleFields.distribution,
    },
    annotations: write,
  }, async ({ id, locale, ...changes }) => safe(async () => {
    const current = await repository.findById(id, locale);
    if (!current) return failure("Article not found.");
    const draft = { ...toDraft(current), ...changes, id, locale };
    if (draft.status === "scheduled" && !draft.scheduledFor) return failure("scheduledFor is required for scheduled articles.");
    const article = await repository.save(draft);
    return success({ article: articlePayload(article) });
  }));

  server.registerTool("admin_publish_article", {
    title: "Publish newsroom article",
    description: "Publish an existing article immediately.",
    inputSchema: { id: idSchema, locale: localeSchema },
    annotations: write,
  }, async ({ id, locale }) => safe(async () => {
    const current = await repository.findById(id, locale);
    if (!current) return failure("Article not found.");
    const article = await repository.save({ ...toDraft(current), status: "published", scheduledFor: null });
    return success({ article: articlePayload(article) });
  }));

  server.registerTool("admin_delete_article", {
    title: "Delete newsroom article",
    description: "Permanently delete an article. Explicit confirmation is required.",
    inputSchema: { id: idSchema, locale: localeSchema, confirm: z.literal(true) },
    annotations: destructive,
  }, async ({ id, locale }) => safe(async () => {
    const current = await repository.findById(id, locale);
    if (!current) return failure("Article not found.");
    await repository.delete(id);
    return success({ deletedId: id });
  }));

  return server;
}

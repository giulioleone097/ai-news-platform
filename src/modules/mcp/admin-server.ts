import { McpServer, type CallToolResult } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import { locales } from "@/i18n";
import {
  articleStatuses,
  socialChannels,
  type Article,
  type ArticleDraftInput,
} from "@/modules/editorial/domain/article";
import type { AdminEditorialRepository } from "@/modules/editorial/domain/article-repository";
import {
  distributionStatuses,
  newsletterStatuses,
  type DistributionPublication,
  type NewsletterSubscription,
} from "@/modules/editorial/domain/editorial-operations";
import type { EditorialCacheInvalidator } from "@/modules/editorial/application/cache-port";
import {
  hasExpectedImageSignature,
  isAllowedEditorialImageSource,
} from "@/lib/editorial-image";
import { ArticleCommandService } from "@/modules/editorial/application/article-commands";
import { registerAdminOperationalTools } from "./admin-operations";

const localeSchema = z.enum(locales);
const statusSchema = z.enum(articleStatuses);
const channelSchema = z.enum(socialChannels);
const idSchema = z.string().uuid();
const entityIdSchema = z.string().trim().min(1).max(160);
const slugSchema = z.string().trim().min(1).max(96).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const webUrlSchema = z.string().trim().max(2_048).refine((value) => {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
});
const mediaTypeSchema = z.enum(["image/avif", "image/gif", "image/jpeg", "image/png", "image/webp"]);
const mediaPathSchema = z.string().trim().min(1).max(256).regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/);
const articleFields = {
  locale: localeSchema,
  title: z.string().trim().min(8).max(180),
  slug: slugSchema.optional(),
  excerpt: z.string().trim().min(20).max(360),
  content: z.string().trim().min(20).max(100_000),
  categorySlug: slugSchema,
  status: statusSchema,
  featured: z.boolean().optional(),
  coverImage: z.string().trim().min(1).max(2_048)
    .refine(isAllowedEditorialImageSource, "Use bundled media or the configured editorial bucket")
    .optional(),
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

function distributionPayload(publication: DistributionPublication) {
  return { ...publication };
}

function subscriptionPayload(subscription: NewsletterSubscription) {
  return { ...subscription };
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

export function createAdminMcpServer(
  repository: AdminEditorialRepository,
  invalidateCache: EditorialCacheInvalidator,
) {
  const server = new McpServer({ name: "neura-ai-news-admin", version: "2.0.0" });
  const commands = new ArticleCommandService(repository);

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
    const article = await commands.save(input);
    await invalidateCache({ locale: article.locale, slugs: [article.slug] });
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
    const article = await commands.save(draft);
    await invalidateCache({
      locale: article.locale,
      slugs: [current.slug, article.slug],
    });
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
    const article = await commands.publish(current);
    await invalidateCache({ locale: article.locale, slugs: [article.slug] });
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
    await commands.delete(id);
    await invalidateCache({ locale: current.locale, slugs: [current.slug] });
    return success({ deletedId: id });
  }));

  server.registerTool("admin_list_distribution", {
    title: "List distribution workflow",
    description: "List saved newsletter and social publication workflow items for one locale.",
    inputSchema: { locale: localeSchema },
    annotations: readOnly,
  }, async ({ locale }) => safe(async () => success({
    items: (await repository.listPublications(locale)).map(distributionPayload),
  })));

  server.registerTool("admin_update_distribution", {
    title: "Update distribution workflow",
    description: "Update channel copy, scheduling, external URL and verified workflow status. This does not post to an external network.",
    inputSchema: {
      id: entityIdSchema,
      status: z.enum(distributionStatuses),
      message: z.string().trim().max(1_000).optional(),
      externalUrl: webUrlSchema.optional(),
      scheduledFor: z.string().datetime().nullable().optional(),
    },
    annotations: write,
  }, async (input) => safe(async () => success({
    publication: distributionPayload(await repository.updatePublication({
      ...input,
      externalUrl: input.externalUrl || null,
    })),
  })));

  server.registerTool("admin_list_newsletter_subscriptions", {
    title: "List newsletter subscriptions",
    description: "List the consented newsletter registry for one locale. Results contain personal data and require admin authentication.",
    inputSchema: {
      locale: localeSchema,
      query: z.string().trim().min(1).max(120).optional(),
      status: z.enum(newsletterStatuses).optional(),
      limit: z.number().int().min(1).max(500).default(100),
      offset: z.number().int().min(0).max(1_000_000).default(0),
    },
    annotations: readOnly,
  }, async (input) => safe(async () => {
    const page = await repository.listSubscriptions(input);
    return success({ ...page, items: page.items.map(subscriptionPayload) });
  }));

  server.registerTool("admin_update_newsletter_subscription", {
    title: "Update newsletter subscription",
    description: "Unsubscribe a consent-registry entry without deleting its audit record. Reactivation always requires double opt-in.",
    inputSchema: { id: entityIdSchema, status: z.literal("unsubscribed") },
    annotations: write,
  }, async ({ id, status }) => safe(async () => {
    await repository.updateSubscriptionStatus(id, status);
    return success({ id, status });
  }));

  server.registerTool("admin_list_media", {
    title: "List newsroom media",
    description: "List immutable assets in the configured editorial media store.",
    inputSchema: {},
    annotations: readOnly,
  }, async () => safe(async () => success({
    writable: repository.writable,
    items: await repository.listAssets(),
  })));

  server.registerTool("admin_upload_media", {
    title: "Upload newsroom media",
    description: "Upload a base64 image up to 160 KiB. Larger assets should use NEURA Studio.",
    inputSchema: {
      name: z.string().trim().min(1).max(160),
      mimeType: mediaTypeSchema,
      dataBase64: z.string().min(4).max(220_000).regex(/^[A-Za-z0-9+/]+={0,2}$/),
    },
    annotations: write,
  }, async ({ name, mimeType, dataBase64 }) => safe(async () => {
    if (!repository.writable) return failure("Media uploads require Supabase Storage.");
    const bytes = Uint8Array.from(Buffer.from(dataBase64, "base64"));
    if (!bytes.byteLength || bytes.byteLength > 163_840) return failure("Media payload exceeds 160 KiB.");
    if (!hasExpectedImageSignature(bytes, mimeType)) return failure("Media bytes do not match the declared image type.");
    return success({ asset: await repository.uploadAsset({ name, mimeType, bytes }) });
  }));

  server.registerTool("admin_delete_media", {
    title: "Delete newsroom media",
    description: "Delete an unused immutable media asset. Explicit confirmation is required.",
    inputSchema: { path: mediaPathSchema, confirm: z.literal(true) },
    annotations: destructive,
  }, async ({ path }) => safe(async () => {
    if (!repository.writable) return failure("Media deletion requires Supabase Storage.");
    const assets = await repository.listAssets();
    const asset = assets.find((item) => item.path === path);
    if (!asset) return failure("Media asset not found.");
    if (await repository.isAssetReferenced(asset.path)) {
      return failure("Media asset is referenced by an article.");
    }
    await repository.deleteAsset(path);
    return success({ deletedPath: path });
  }));

  registerAdminOperationalTools(server);

  return server;
}
